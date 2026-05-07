# Fase 3-A+D — Vista del Terapista + Agenda Digital

**Fecha:** 2026-05-07  
**Proyecto:** Kinetic Center CRM  
**Scope:** Módulo A (vista `/mi-dia` con cronómetro) + Módulo D (agenda digital terapista ↔ padre)

---

## Contexto

El terapista hoy no tiene ninguna vista operativa propia. Ve el calendario general (`/agenda`) que es compartido con todo el staff, y no puede registrar el inicio/fin de una sesión ni dejarle notas a la familia desde la app. Este slice cubre esas dos necesidades de forma independiente y deployable.

Lo que ya existe y se reutiliza:
- `appointments` table con status `scheduled | in_progress | completed | ...`
- `src/app/(app)/agenda/` — calendario general (no se toca)
- `src/lib/domain/appointment.ts` — helpers de formateo y solapamiento
- Portal de padres en `src/app/(portal)/portal/` — ya funciona con `role = 'family'` via `family_users` (tabla existente, incluye columna `can_work boolean`)

Lo que NO se reutiliza:
- `src/components/inbox/` — infraestructura de mensajería de FM. La agenda digital requiere categorías clínicas, `visible_to_family`, y vínculo con appointment; no encaja en el modelo de conversations/messages.

**Directorio de migraciones:** `supabase/migrations-kinetic/` (no `supabase/migrations/` que corresponde a FM). El número de secuencia sigue la numeración Kinetic existente.

---

## Sección 1 — Base de datos

### `therapy_sessions`

```sql
id              uuid PK default gen_random_uuid()
appointment_id  uuid NOT NULL UNIQUE FK appointments(id) ON DELETE CASCADE
therapist_id    uuid NOT NULL FK users(id) ON DELETE SET NULL
  -- NOT NULL al crear; ON DELETE SET NULL para preservar historial si el usuario se elimina.
  -- Una sesión huérfana (therapist_id NULL) queda visible solo para admins.
child_id        uuid NOT NULL FK children(id) ON DELETE CASCADE
started_at      timestamptz NOT NULL DEFAULT now()
ended_at        timestamptz NULL        -- null mientras la sesión está activa
status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed'))
created_at      timestamptz NOT NULL DEFAULT now()
```

UNIQUE en `appointment_id` garantiza que no existan dos sesiones para la misma cita.

**Campos inmutables:** `appointment_id` y `child_id` no pueden modificarse después del INSERT. Se protegen con un trigger explícito:

```sql
CREATE OR REPLACE FUNCTION trg_therapy_sessions_immutable_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     OR NEW.child_id IS DISTINCT FROM OLD.child_id THEN
    RAISE EXCEPTION 'appointment_id y child_id son inmutables en therapy_sessions';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER therapy_sessions_immutable
  BEFORE UPDATE ON therapy_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_therapy_sessions_immutable_fields();
```

### `child_journal_entries`

```sql
id                    uuid PK default gen_random_uuid()
child_id              uuid NOT NULL FK children(id) ON DELETE CASCADE
author_user_id        uuid FK users(id) ON DELETE SET NULL
category              text NOT NULL CHECK (category IN ('home_exercise','observation','question','response'))
body                  text NOT NULL
attachments_json      jsonb NOT NULL DEFAULT '[]'   -- columna lista, UI no la expone en este slice
visible_to_family     boolean NOT NULL DEFAULT false
linked_appointment_id uuid FK appointments(id) ON DELETE SET NULL  -- nullable
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()
```

**`updated_at` trigger:**

```sql
CREATE TRIGGER child_journal_entries_updated_at
  BEFORE UPDATE ON child_journal_entries
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
  -- Requiere la extensión moddatetime (disponible en Supabase).
  -- Alternativa: trigger genérico con NEW.updated_at = now()
```

### RLS — `therapy_sessions`

```sql
-- SELECT: staff completo O terapeuta propio
SELECT: is_agency_user() OR therapist_id = auth.uid()

-- INSERT: terapeuta asignado O admin
INSERT with check: therapist_id = auth.uid() OR is_admin()

-- UPDATE: solo el terapeuta propietario.
-- USING filtra qué filas puede tocar; WITH CHECK impide cambiar ownership.
-- Los campos inmutables (appointment_id, child_id) están protegidos además por trigger.
UPDATE using:      therapist_id = auth.uid()
UPDATE with check: therapist_id = auth.uid()

-- Admin override (policy separada)
UPDATE using (admin):      is_admin()
UPDATE with check (admin): is_admin()

-- DELETE
DELETE: is_admin()
```

### RLS — `child_journal_entries`

```sql
-- SELECT staff (todas las entradas, incluyendo las no visibles para familia)
SELECT: is_agency_user()

-- SELECT familia (filtrado en DB — las entradas internas nunca llegan al browser del padre)
SELECT: visible_to_family = true AND is_family_of_child(child_id)

-- INSERT staff: author_user_id = auth.uid() se aplica tanto en RLS como en la server action.
-- Defensa en profundidad: la policy también lo exige a nivel DB.
INSERT with check: is_agency_user() AND author_user_id = auth.uid()

-- INSERT familia (solo respuestas, siempre visibles, author = caller)
INSERT with check: is_family_of_child(child_id)
              AND category = 'response'
              AND visible_to_family = true
              AND author_user_id = auth.uid()

-- UPDATE: solo staff, propio autor O admin.
-- La familia NO tiene policy de UPDATE (no puede editar respuestas enviadas).
UPDATE using:      is_agency_user() AND (author_user_id = auth.uid() OR is_admin())
UPDATE with check: is_agency_user() AND (author_user_id = auth.uid() OR is_admin())

-- DELETE: solo admin
DELETE: is_admin()
```

### Funciones PL/pgSQL requeridas por server actions

**`start_therapy_session(p_appointment_id uuid, p_therapist_id uuid)`**

Corre dentro de una transacción implícita de Postgres. Si falla cualquier paso, todo revierte:

```sql
CREATE OR REPLACE FUNCTION start_therapy_session(
  p_appointment_id uuid,
  p_therapist_id   uuid
) RETURNS therapy_sessions LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_appt   appointments;
  v_session therapy_sessions;
BEGIN
  -- Verificación autoritativa dentro de la transacción
  SELECT * INTO v_appt FROM appointments
    WHERE id = p_appointment_id
      AND therapist_id = p_therapist_id   -- el llamador es el terapista asignado
      AND status = 'scheduled'
    FOR UPDATE;                            -- lock para evitar race concurrente

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found_or_not_eligible';
  END IF;

  -- Insertar sesión (el UNIQUE en appointment_id atrapa duplicados)
  INSERT INTO therapy_sessions (appointment_id, therapist_id, child_id)
    VALUES (p_appointment_id, p_therapist_id, v_appt.child_id)
    RETURNING * INTO v_session;

  -- Actualizar cita (atómica con el insert)
  UPDATE appointments SET status = 'in_progress' WHERE id = p_appointment_id;

  RETURN v_session;
END;
$$;
```

**`finish_therapy_session(p_session_id uuid, p_therapist_id uuid)`**

```sql
CREATE OR REPLACE FUNCTION finish_therapy_session(
  p_session_id    uuid,
  p_therapist_id  uuid
) RETURNS therapy_sessions LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session therapy_sessions;
BEGIN
  SELECT * INTO v_session FROM therapy_sessions
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_session.therapist_id != p_therapist_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Idempotente: si ya está completa, retorna el estado actual sin error
  IF v_session.status = 'completed' THEN
    RETURN v_session;  -- el caller detecta already_finished via ended_at != NULL
  END IF;

  UPDATE therapy_sessions
    SET ended_at = now(), status = 'completed'
    WHERE id = p_session_id
    RETURNING * INTO v_session;

  UPDATE appointments SET status = 'completed'
    WHERE id = v_session.appointment_id;

  RETURN v_session;
END;
$$;
```

---

## Sección 2 — Módulo A: `/mi-dia`

### Ruta y acceso

`src/app/(app)/mi-dia/page.tsx` — server component.  
Roles permitidos: `terapista`, `maestra`. Resto redirige a `/agenda`.

### Datos cargados en el server

```typescript
// Rango: hoy 00:00:00 → mañana 00:00:00 (exclusive), en zona horaria El Salvador (UTC-6)
// Usar date-fns-tz: no confiar en la TZ del servidor Vercel (UTC).
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/El_Salvador'
const nowInSV    = toZonedTime(new Date(), TZ)
const todayStart = fromZonedTime(
  new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate(), 0, 0, 0),
  TZ
)
const tomorrowStart = fromZonedTime(
  new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate() + 1, 0, 0, 0),
  TZ
)

// Citas del terapista hoy
appointments WHERE therapist_id = currentUserId
  AND starts_at >= todayStart.toISOString()
  AND starts_at <  tomorrowStart.toISOString()   -- exclusive: no se usa 23:59
  AND status NOT IN ('rescheduled')
ORDER BY starts_at ASC

// Sesiones de hoy (para mostrar cronómetro si hay una activa)
therapy_sessions WHERE therapist_id = currentUserId
  AND started_at >= todayStart.toISOString()
```

### Componentes

```
src/app/(app)/mi-dia/
  page.tsx              — server: carga datos, pasa a MiDiaClient
  MiDiaClient.tsx       — client: maneja estado del timer y optimistic updates

src/components/agenda/
  SessionCard.tsx       — tarjeta individual de la cita con controles de estado
```

### Comportamiento de SessionCard

| Estado appointment | UI |
|---|---|
| `scheduled` | Botón **Iniciar** (verde) |
| `in_progress` | Cronómetro `MM:SS` corriendo + botón **Finalizar** |
| `completed` | Duración real (ej. "32 min") + checkmark + botón "Dejar nota" |
| `no_show` / `late_cancel` | Badge de estado, sin controles |

### Cronómetro (sin drift)

```typescript
// El valor calculado siempre deriva de started_at — no acumula estado local
const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
// useEffect con setInterval(_, 1000) solo para forzar re-render
```

### Server Actions — `src/app/actions/therapy-sessions.ts`

**`startTherapySession(appointmentId)`**
1. Llamar `supabase.rpc('start_therapy_session', { p_appointment_id: appointmentId, p_therapist_id: currentUser.id })`.
2. Si la RPC lanza excepción `appointment_not_found_or_not_eligible`: retornar `{ ok: false, error: 'Cita no disponible' }`.
3. Si viola UNIQUE (`23505` / `appointment_not_found_or_not_eligible` ya manejado dentro del RPC): retornar `{ ok: false, error: 'Sesión ya iniciada' }`.
4. Retornar `{ ok: true, session }`.

El check optimista pre-RPC en la server action es opcional (mejora UX) pero la verificación autoritativa ocurre dentro del PL/pgSQL con `FOR UPDATE` lock.

**`finishTherapySession(sessionId)`**
1. Llamar `supabase.rpc('finish_therapy_session', { p_session_id: sessionId, p_therapist_id: currentUser.id })`.
2. Si la RPC lanza `session_not_found`: retornar `{ ok: false, error: 'Sesión no encontrada' }`.
3. Si lanza `not_authorized`: retornar `{ ok: false, error: 'No autorizado' }`.
4. Si la sesión retornada tiene `ended_at != null` y lo tenía antes de la llamada: retornar `{ ok: true, alreadyFinished: true }` — el cliente trata esto como no-op, no muestra error.
5. Si completó exitosamente: retornar `{ ok: true, session }`.

`revalidatePath('/mi-dia')` al final de ambas acciones.

### Sidebar

Agregar `/mi-dia` al sidebar **antes** de Agenda, visible solo para `terapista` y `maestra`:

```typescript
{
  href: '/mi-dia',
  label: 'Mi día',
  allowedRoles: ['terapista', 'maestra'],
  icon: /* icono calendar-today */
}
```

---

## Sección 3 — Módulo D: Agenda Digital

### Portal — compatibilidad con `role = 'family'`

El layout del portal `src/app/(portal)/portal/layout.tsx` actualmente acepta `role = 'client'`. Los padres de Kinetic tienen `role = 'family'`. El layout debe extenderse:

```typescript
// Antes
if (role !== 'client') redirect('/dashboard')
// Después
if (role !== 'client' && role !== 'family') redirect('/dashboard')
```

La nav del portal se extiende con "Agenda digital" para ambos roles.

**Auth gate en `/portal/agenda-digital/page.tsx`:**  
Leer `family_users.can_work` (tabla existente, columna boolean). Si `can_work = false`, mostrar mensaje de acceso restringido.

### Puntos de entrada

**En la app (staff):**
- Desde `/mi-dia`: al completar sesión, el botón "Dejar nota" abre el journal del niño con `linkedAppointmentId` pre-rellenado.
- Desde `/familias/[id]`: nueva tab "Agenda digital" en la ficha del niño.

**En el portal (padre):**
- Ruta: `/portal/agenda-digital` (una sola ruta, sin parámetro de niño — el childId se maneja con tabs en UI).
- Si hay múltiples hijos, tabs por niño en la parte superior.
- `revalidatePath('/portal/agenda-digital')` invalida la página completa correctamente.

### Componente `ChildJournal`

El **server component padre** (page.tsx o JournalTab.tsx) pre-filtra las entradas antes de pasarlas como prop:
- Si viewer es staff: consulta todas las entradas del niño.
- Si viewer es familia: consulta **solo** `WHERE visible_to_family = true`. Las entradas internas nunca se transmiten al browser del padre — el filtrado ocurre en la query de Supabase, no en JS cliente.

```typescript
interface ChildJournalProps {
  entries: ChildJournalEntry[]     // ya filtradas server-side según rol del viewer
  childId: string
  currentUserId: string
  isFamily: boolean                // true → composer limitado a respuestas
  canWrite: boolean
  linkedAppointmentId?: string     // pre-rellena el composer al abrir desde mi-día
}
```

**`JournalEntryList`** (puro, sin estado):
- Recibe `entries` ya pre-filtradas (no filtra internamente)
- Agrupa por día
- Badge de categoría: ejercicio 🟢, observación 🔵, pregunta 🟡, respuesta ⚪
- Si `!isFamily`: muestra badge "Solo interno" en las no visibles + botón toggle visibilidad

**`JournalEntryComposer`** (tiene estado local del form):
- Campo de texto + selector de categoría
- Toggle "Visible para la familia" (solo staff, default `true` para `home_exercise`, `false` para `observation`)
- Familia: solo puede escribir respuestas, toggle fijo en `true`

```
src/components/agenda/
  ChildJournal.tsx              — contenedor thin
  JournalEntryList.tsx          — lista readonly
  JournalEntryComposer.tsx      — form de escritura
```

### Server Actions — `src/app/actions/child-journal.ts`

**`createJournalEntry({ childId, category, body, visibleToFamily, linkedAppointmentId })`**
- Asigna `author_user_id = currentUser.id` siempre server-side (no viene del cliente).
- Si el autor tiene `role = 'family'`: fuerza `category = 'response'`, `visibleToFamily = true` independientemente de los parámetros recibidos.
- Revalidate: `revalidatePath('/mi-dia')`, `revalidatePath(\`/familias/${childId}\`)`, `revalidatePath('/portal/agenda-digital')`.

**`toggleJournalEntryVisibility(entryId)`**
1. Verificar que `currentUser.role !== 'family'`. Si es familia: retornar `{ ok: false, error: 'No autorizado' }`.
2. Fetch entry. Si no existe: retornar `{ ok: false, error: 'Entrada no encontrada' }`.
3. Verificar `author_user_id = currentUser.id` OR `is_admin()`. Admins pueden toggle cualquier entrada.
4. Toggle `visible_to_family`.
5. Revalidate en las mismas rutas.

### Archivos

```
src/components/agenda/ChildJournal.tsx
src/components/agenda/JournalEntryList.tsx
src/components/agenda/JournalEntryComposer.tsx
src/app/(app)/familias/[id]/JournalTab.tsx
src/app/(portal)/portal/agenda-digital/page.tsx
src/app/(portal)/portal/agenda-digital/PortalJournalClient.tsx
src/app/actions/child-journal.ts
```

---

## Archivos afectados / nuevos (resumen completo)

| Archivo | Acción |
|---|---|
| `supabase/migrations-kinetic/0093_kinetic_sessions_and_journal.sql` | Nuevo (tablas + triggers + RLS + funciones PL/pgSQL) |
| `src/types/db.ts` | Añadir `TherapySession`, `ChildJournalEntry` |
| `src/app/actions/therapy-sessions.ts` | Nuevo |
| `src/app/actions/child-journal.ts` | Nuevo |
| `src/app/(app)/mi-dia/page.tsx` | Nuevo |
| `src/app/(app)/mi-dia/MiDiaClient.tsx` | Nuevo |
| `src/components/agenda/SessionCard.tsx` | Nuevo |
| `src/components/agenda/ChildJournal.tsx` | Nuevo |
| `src/components/agenda/JournalEntryList.tsx` | Nuevo |
| `src/components/agenda/JournalEntryComposer.tsx` | Nuevo |
| `src/app/(app)/familias/[id]/page.tsx` | Añadir tab "Agenda digital" |
| `src/app/(app)/familias/[id]/JournalTab.tsx` | Nuevo |
| `src/app/(portal)/portal/layout.tsx` | Aceptar `role = 'family'` + agregar nav item |
| `src/app/(portal)/portal/agenda-digital/page.tsx` | Nuevo |
| `src/app/(portal)/portal/agenda-digital/PortalJournalClient.tsx` | Nuevo |
| `src/components/layout/Sidebar.tsx` | Añadir "Mi día" para terapista/maestra |

---

## Fuera de scope (Fase 4+)

- Split timer documentación (worked vs standby)
- UI de attachments en journal entries (columna existe en DB, no se expone)
- Notificaciones push al padre cuando hay entrada nueva
- Realtime en el journal
