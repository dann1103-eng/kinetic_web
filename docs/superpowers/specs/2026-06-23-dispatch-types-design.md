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
   recogida tardía. Recepción decide cobrar o perdonar directamente en la tarjeta
   flotante — sin pasar por `/aprobaciones`.

3. **Entrega directa a papá**: el papá ya está en el local y la terapista lo entrega
   directamente. Despacho inmediato, sin timer ni cargo.

---

## Modelo de datos

### Migración `0150_dispatch_type.sql`

```sql
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS dispatch_type text
    CHECK (dispatch_type IN ('internal','to_reception','to_parent')),
  ADD COLUMN IF NOT EXISTS handed_to_reception_at timestamptz;

-- Cola de recepción: appointments esperando que el papá recoja al niño.
CREATE INDEX IF NOT EXISTS appointments_reception_queue_idx
  ON public.appointments (handed_to_reception_at)
  WHERE dispatch_type = 'to_reception'
    AND dispatched_at IS NULL
    AND handed_to_reception_at IS NOT NULL;
```

**`dispatch_type`**:
- `'internal'` — pase a otra terapista, sin timer ni cargo
- `'to_reception'` — entregado a recepción; timer corre desde `handed_to_reception_at`
- `'to_parent'` — entrega directa al papá, sin cargo
- `null` — citas legacy (comportamiento previo preservado)

**`handed_to_reception_at`**: timestamp de cuando la terapista hizo "Entregar a
recepción". El timer de 15 min de gracia corre desde aquí hasta `dispatched_at`.
Más justo que `completed_at` porque la terapista puede tardar unos minutos en
llevar al niño hasta recepción.

**Nota semántica**: para citas `to_reception`, `late_fee_minutes` almacenado en DB
representa tiempo de espera desde `handed_to_reception_at`, no desde `completed_at`.
Esto es intencional y coherente con lo que muestra `/aprobaciones`.

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

- Valida `appointment.status === 'completed'` y `dispatched_at IS NULL`
- **Guard idempotente**: si `handed_to_reception_at` ya está seteado, devuelve
  `{ ok: true }` sin escribir (no-op silencioso — cubre re-renders stale del cliente)
- Setea `dispatch_type = 'to_reception'`, `handed_to_reception_at = now()`
- Revalida `/mi-dia`, `/agenda`

### Modificada: `dispatchChild(appointmentId, dispatchType, waiveReason?: string)`

Firma completa con `waiveReason` opcional.

**`'internal'` o `'to_parent'`**:
- Setea `dispatched_at = now()`, `dispatch_type`, `late_fee_status = 'none'`, `late_fee_usd = 0`
- Revalida `/mi-dia`, `/agenda`, `/aprobaciones`

**`'to_reception'`** (llamado solo cuando recepción elige "Perdonar"):
- Calcula fee llamando `computeLatePickup(appt.handed_to_reception_at!, now())`
  (no `completed_at` — la función pura en `late-pickup.ts` no cambia, solo cambia
  el argumento que se le pasa)
- Si `fee > 0` y `waiveReason` presente: setea `late_fee_status = 'waived'`,
  `late_fee_waive_reason = waiveReason`, `late_fee_usd = fee.feeUsd`,
  `late_fee_minutes = fee.minutes`
- Si `fee === 0` (sin importar `waiveReason`): setea `late_fee_status = 'none'` —
  la validación de motivo se omite cuando no hay cargo; **no se usa empty-string**
- Setea `dispatched_at = now()`, `dispatched_by_user_id`
- Revalida `/mi-dia`, `/agenda`, `/aprobaciones`

### Nueva: `dispatchAndCharge(appointmentId)`

Llamada cuando recepción elige "Cobrar $X.XX" (combina dispatch + confirm en una sola
transacción para que el cargo quede en `'charged'` directamente, sin pasar por
`/aprobaciones`):
- Calcula fee llamando `computeLatePickup(appt.handed_to_reception_at!, now())`
- **Guard**: si `fee === 0`, retorna `{ ok: false, error: 'Sin cargo' }` — la UI solo
  muestra "Cobrar" cuando el timer supera 15 min, pero esta guardia protege la carrera
  posible entre render y ejecución
- Si `fee > 0`: setea `dispatched_at = now()`, `dispatch_type = 'to_reception'`,
  `dispatched_by_user_id`, `late_fee_status = 'charged'`, `late_fee_usd = fee.feeUsd`,
  `late_fee_minutes = fee.minutes` y acumula línea en la factura del ciclo mensual del
  niño (igual que `confirmLateFee()` hoy)
- Revalida `/mi-dia`, `/agenda`, `/aprobaciones`

**Nota**: los cargos de tipo `to_reception` marcados `'charged'` por `dispatchAndCharge()`
o `'waived'` por `dispatchChild()` no tienen `late_fee_status = 'suggested'`, por lo que
`listSuggestedLateFees()` — que filtra por `status = 'suggested'` — no los devuelve y
no aparecen en `/aprobaciones`. Comportamiento correcto e intencional.

### Modificada: `listPendingDispatches()`

Agregar filtro para excluir appointments ya en cola de recepción (evitar que el
safety-net popup de la terapista se dispare para niños que ya fueron entregados a
recepción):
```typescript
// Excluir appointments con dispatch_type='to_reception' y handed_to_reception_at seteado
.or('dispatch_type.is.null,dispatch_type.in.(internal,to_parent)')
// o equivalente: .not('dispatch_type', 'eq', 'to_reception')
```

### Nueva: `listReceptionQueue()`

```typescript
// Retorna:
{
  id: string
  child_full_name: string
  service_type: string | null
  handed_to_reception_at: string   // el cliente calcula el monto desde el timer
}[]
```

Filtra: `dispatch_type = 'to_reception'`, `dispatched_at IS NULL`,
`handed_to_reception_at IS NOT NULL`. El monto del cargo se calcula **client-side**
desde el timer para mantenerse actualizado cada tick (no se devuelve desde el servidor).

---

## Componente DispatchWatcher (`src/components/dispatch/DispatchWatcher.tsx`)

### Para recepción (`role === 'recepcion'`)

Tarjetas flotantes apiladas en la esquina inferior derecha (mismo patrón visual
que las notificaciones de chat).

- Fetch inicial de `listReceptionQueue()` al montar
- Suscripción realtime a `appointments` (INSERT/UPDATE donde `dispatch_type='to_reception'`)
- Estado local: `snoozedUntil: Map<string, number>` — oculta tarjetas client-side sin
  escribir a DB (el snooze de recepción es solo visual, 10 min)
- Timer cliente: tick cada 5 s, calcula `minutesSince(handed_to_reception_at)`
  usando `computeLatePickup()` de `late-pickup.ts`
- **Estado normal (< 15 min)**: border-left `#00675c`, timer en verde
- **Estado tardío (≥ 15 min)**: border-left `#b31b25`, timer en rojo, badge con monto
- Botón **"Despachar a papá"** → abre mini-modal inline:
  - Sin cargo → botón "Confirmar despacho" → llama `dispatchChild(id, 'to_reception')` (sin waiveReason)
  - Con cargo → "Cobrar $X.XX" → llama `dispatchAndCharge(id)` ✓ queda `'charged'`,
    NO aparece en `/aprobaciones`
  - Con cargo → "Perdonar" → campo de motivo (≥ 3 chars) → llama
    `dispatchChild(id, 'to_reception', motivo)` → queda `'waived'`
- Botón **···** → snooze client-side 10 min (setea `snoozedUntil[id] = now + 10min`,
  no escribe a DB, la tarjeta reaparece al recargar o al expirar el snooze)
- Múltiples niños = múltiples tarjetas; la más tardía primero

### Para terapistas/maestras

Mantiene el popup existente como **safety net** con el filtro corregido en
`listPendingDispatches()`: no dispara para niños ya en cola de recepción.

### Para gestión (admin, directora, coordinadoras)

Sin cambio: popup existente.

---

## UI en Mi día (`src/components/mi-dia/BigSessionCard.tsx`)

Los 3 botones de despacho son visibles cuando:
- `appointment.status === 'completed'`
- `session?.ended_at` existe
- `dispatched_at IS NULL`
- `handed_to_reception_at IS NULL`

Si `handed_to_reception_at` seteado y `dispatched_at IS NULL` → mostrar chip ámbar
"🔔 En recepción desde HH:MM" (botones ocultos).

Si `dispatched_at` seteado → chip según `dispatch_type`:
- `internal` → chip gris "↪ Entregado internamente"
- `to_reception` → chip verde "✓ Despachado a papá"
- `to_parent` → chip verde "✓ Entregado a papá"

**Botones y acciones**:

| Botón | Estilo | Action |
|-------|--------|--------|
| ↪ Entrega interna | `bg-sky-100 text-sky-800` | `dispatchChild(id, 'internal')` |
| 🔔 Entregar a recepción | `bg-amber-100 text-amber-800` | `handToReception(id)` |
| ✓ Entrega directa a papá | `bg-emerald-100 text-emerald-800` | `dispatchChild(id, 'to_parent')` |

---

## Archivos clave

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/0150_dispatch_type.sql` | Columnas `dispatch_type`, `handed_to_reception_at` + índice |
| `src/types/db.ts` | Campos en `Appointment` + Insert |
| `src/app/actions/dispatch.ts` | `handToReception()` nueva; `dispatchAndCharge()` nueva; `dispatchChild()` acepta `dispatchType` + `waiveReason`; `listPendingDispatches()` filtro corregido; `listReceptionQueue()` nueva |
| `src/components/mi-dia/BigSessionCard.tsx` | 3 botones + estados post-click |
| `src/components/dispatch/DispatchWatcher.tsx` | Bifurcar por rol; tarjetas flotantes para recepción con snooze client-side |

---

## Verificación

1. `npm run lint` + `npm run build` sin errores.
2. Aplicar migración `0150` en Supabase.
3. Manual:
   - Terapista completa terapia → aparecen 3 botones
   - "Entrega interna" → chip gris inmediato; sin tarjeta en recepción; sin cargo
   - "Entregar a recepción" → chip ámbar; tarjeta flotante aparece en recepción en realtime
   - Timer terapista: **no** dispara safety-net popup para este niño
   - Timer recepción llega a 15 min → tarjeta se pone roja con monto de cargo
   - Recepción → "Cobrar $5.00" → cargo queda `'charged'`; NO aparece en `/aprobaciones`
   - Recepción → "Perdonar" con motivo → cargo `'waived'`; NO aparece en `/aprobaciones`
   - Tarjeta desaparece en realtime en todos los perfiles de recepción
   - "Entrega directa a papá" → chip verde inmediato; sin tarjeta; sin cargo
   - Snooze (···) → tarjeta se oculta 10 min client-side; reaparece sola al expirar
