# Diseño: Tres tipos de despacho de niños

## Contexto

El flujo de despacho actual tiene un único botón "Despachar niño/a" que asume siempre
que el niño es recogido directamente por los padres. La clínica necesita distinguir
tres escenarios operativos distintos:

1. **Entrega interna**: la terapista pasa al niño a otra terapista para su siguiente
   sesión. Solo es un registro; no inicia timer ni genera cargo.

2. **Entrega a recepción**: la terapista lleva al niño a recepción, que espera al
   papá. Desde ese momento recepción controla un timer de 15 minutos. Si el papá
   tarda más de 15 min desde que el niño llegó a recepción, se genera un cargo por
   recogida tardía que recepción puede cobrar o perdonar en el acto.

3. **Entrega directa a papá**: el papá ya está en el local y la terapista lo entrega
   directamente. Despacho inmediato, sin timer ni cargo.

El cambio también mueve la decisión de cobrar/perdonar el cargo tardío directamente
a la tarjeta flotante de recepción, en lugar de requerir que alguien vaya a
`/aprobaciones`.

---

## Modelo de datos

### Migración `0150_dispatch_type.sql`

Dos columnas nuevas en `appointments`:

```sql
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS dispatch_type text
    CHECK (dispatch_type IN ('internal','to_reception','to_parent')),
  ADD COLUMN IF NOT EXISTS handed_to_reception_at timestamptz;

-- Índice para la cola de recepción (appointments esperando despacho a papá)
CREATE INDEX IF NOT EXISTS appointments_reception_queue_idx
  ON public.appointments (handed_to_reception_at)
  WHERE dispatch_type = 'to_reception'
    AND dispatched_at IS NULL
    AND handed_to_reception_at IS NOT NULL;
```

**`dispatch_type`**:
- `'internal'` — pase a otra terapista, sin timer ni cargo
- `'to_reception'` — entregado a recepción, timer corre desde `handed_to_reception_at`
- `'to_parent'` — entrega directa al papá, sin cargo
- `null` — citas legacy (comportamiento previo preservado)

**`handed_to_reception_at`**: timestamp de cuando la terapista hizo "Entregar a
recepción". El timer de los 15 minutos de gracia corre desde aquí hasta `dispatched_at`
(cuando recepción marca que el papá recogió). Más justo que `completed_at` porque la
terapista puede tardar unos minutos en llevar al niño hasta recepción.

### Tipos TypeScript (`src/types/db.ts`)

Agregar a `interface Appointment`:
```typescript
dispatch_type: 'internal' | 'to_reception' | 'to_parent' | null
handed_to_reception_at: string | null
```

Agregar al `Insert` de `appointments` en `Database`:
```typescript
dispatch_type?: 'internal' | 'to_reception' | 'to_parent' | null
handed_to_reception_at?: string | null
```

---

## Server actions (`src/app/actions/dispatch.ts`)

### Nueva: `handToReception(appointmentId)`

Cuando la terapista elige "Entregar a recepción":
- Valida que `appointment.status === 'completed'` y `dispatched_at IS NULL`
- Setea `dispatch_type = 'to_reception'` y `handed_to_reception_at = now()`
- Revalida `/mi-dia`
- El realtime de `appointments` notifica inmediatamente a recepción

### Modificada: `dispatchChild(appointmentId, dispatchType, waiveReason?)`

Acepta el nuevo parámetro `dispatchType`:

**`'internal'` o `'to_parent'`**:
- Setea `dispatched_at = now()`, `dispatch_type`, `late_fee_status = 'none'`, `late_fee_usd = 0`
- Sin cargo

**`'to_reception'`** (llamado por recepción al marcar "Despachar a papá"):
- Calcula fee desde `handed_to_reception_at` (no desde `completed_at` como hoy)
- Si `waiveReason` viene informado → `late_fee_status = 'waived'`, `late_fee_waive_reason = waiveReason`
- Si `fee > 0` y no hay `waiveReason` → `late_fee_status = 'suggested'`
- Si `fee === 0` → `late_fee_status = 'none'`
- Setea `dispatched_at = now()`, `dispatched_by_user_id`

### Nueva: `listReceptionQueue()`

Para las tarjetas flotantes de recepción:
```typescript
// Retorna:
{
  id: string              // appointment id
  child_full_name: string
  service_type: string | null
  handed_to_reception_at: string
  late_fee_usd: number    // estimación en tiempo real
}[]
```
Filtra: `dispatch_type = 'to_reception'`, `dispatched_at IS NULL`,
`handed_to_reception_at IS NOT NULL`. Acceso: cualquier `is_agency_user()`.

---

## Componente DispatchWatcher (`src/components/dispatch/DispatchWatcher.tsx`)

Se bifurca por rol:

### Para recepción (`role === 'recepcion'`)

Muestra **tarjetas flotantes apiladas** en la esquina inferior derecha (mismo patrón
visual que las notificaciones de chat).

- Fetch inicial de `listReceptionQueue()` al montar
- Suscripción realtime a `appointments` (INSERT/UPDATE donde `dispatch_type='to_reception'`)
- Timer cliente: tick cada 5 s, cuenta desde `handed_to_reception_at`
- **Estado normal (< 15 min)**: border-left verde, timer en `#00675c`
- **Estado tardío (≥ 15 min)**: border-left rojo `#b31b25`, timer en rojo, badge con monto de cargo
- Botón **"Despachar a papá"** → abre mini-modal inline:
  - Sin cargo → "Confirmar despacho" (1 botón)
  - Con cargo → "Cobrar $X.XX" + "Perdonar" (con campo de motivo obligatorio ≥ 3 chars)
  - Al confirmar llama `dispatchChild(id, 'to_reception', waiveReason?)` → tarjeta desaparece en realtime
- Botón **···** → `snoozeDispatch()` (10 min, igual que hoy)
- Múltiples niños = múltiples tarjetas apiladas verticalmente (la más tardía primero)

### Para terapistas/maestras

Mantiene el popup existente como **safety net**: si `completed_at` existe, `dispatched_at IS NULL`
y han pasado ≥ 15 min, aparece el popup "¿sigue ahí?". Cubre el caso en que la terapista
olvidó presionar cualquiera de los 3 botones.

### Para gestión (admin, directora, coordinadoras)

Sin cambio: popup existente.

---

## UI en Mi día (`src/components/mi-dia/BigSessionCard.tsx`)

El botón "Despachar niño/a" se reemplaza por **3 botones de despacho** visibles cuando
`appointment.status === 'completed'` y `session?.ended_at` existe y `dispatched_at IS NULL`
y `handed_to_reception_at IS NULL`.

```
[↪ Entrega interna]  [🔔 Entregar a recepción]  [✓ Entrega directa a papá]
```

Estilos (coherentes con el mockup aprobado):
- **Interna**: `bg-sky-100 text-sky-800`
- **Recepción**: `bg-amber-100 text-amber-800`
- **Papá**: `bg-emerald-100 text-emerald-800`

**Comportamiento post-click**:
- **Interna / Papá**: Llama `dispatchChild(id, tipo)` → muestra chip "✓ Despachado [tipo]"
- **Recepción**: Llama `handToReception(id)` → muestra chip ámbar "🔔 En recepción desde HH:MM"
  (botones desaparecen; la tarjeta ya no puede volver a presionarse)

Si `handed_to_reception_at` existe y `dispatched_at IS NULL` → mostrar chip ámbar (niño
esperando en recepción). Si `dispatched_at` existe → chip verde según tipo.

---

## Archivos clave

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/0150_dispatch_type.sql` | Columnas + índice |
| `src/types/db.ts` | `dispatch_type`, `handed_to_reception_at` en Appointment + Insert |
| `src/app/actions/dispatch.ts` | `handToReception()`, `listReceptionQueue()`, modificar `dispatchChild()` |
| `src/components/mi-dia/BigSessionCard.tsx` | 3 botones + estados |
| `src/components/dispatch/DispatchWatcher.tsx` | Bifurcar por rol; tarjetas flotantes para recepción |

---

## Verificación

1. `npm run lint` + `npm run build` sin errores.
2. Aplicar migración `0150` en Supabase.
3. Manual:
   - Terapista completa terapia → aparecen 3 botones
   - "Entrega interna" → chip inmediato, sin tarjeta en recepción
   - "Entregar a recepción" → chip ámbar en Mi día; tarjeta flotante aparece en recepción en tiempo real
   - Timer de recepción llega a 15 min → tarjeta se vuelve roja con monto de cargo
   - Recepción marca "Despachar a papá" → modal inline; cobrar → cargo registrado; perdonar → waived
   - Tarjeta desaparece en realtime en todos los perfiles de recepción abiertos
   - "Entrega directa a papá" → chip verde inmediato, sin tarjeta en recepción

## Notas

- Los cargos tardíos que recepción decide cobrar desde la tarjeta siguen apareciendo en
  `/aprobaciones` para auditoría, pero ya están en estado `'suggested'` (pendiente de
  confirmación final). Los que recepción perdonó directamente quedan en `'waived'` y no
  aparecen en la bandeja.
- Citas legacy (null `dispatch_type`) mantienen comportamiento actual.
- No hay nueva migración en Supabase para los chats/mensajería — la UI de tarjetas
  flotantes se hace en React con el realtime de `appointments` que ya está publicado
  (mig 0140).
