# Gestión de terapias: pre-marcar inasistencia, reasignar terapista, mover con confirmación y notificaciones

**Fecha:** 2026-06-25
**Estado:** Aprobado (con garantía de visibilidad para la nueva terapista)

## Problema / objetivo

Hoy desde la agenda el drag-and-drop solo mueve fecha/hora (instantáneo, sin
confirmación ni aviso). Coordinación necesita:

1. **Pre-marcar la inasistencia** de una terapia con anticipación (sin esperar a
   que la terapeuta asignada la marque) para poder reponerla cuando los papás
   respondan. Solo terapias; los programas matutinos quedan fuera.
2. **Reasignar la terapista** de una terapia (cobertura) y/o **mover fecha/hora**,
   con un **diálogo de confirmación** antes de aplicar.
3. Al confirmar, **notificar**: a la terapista actual (se le movió / se le quitó)
   y a la nueva (se le asignó como cobertura).
4. Dejar **evidencia** de la cobertura para que admin/recepción decidan después si
   se paga como extraordinario (NO se marca `is_extra` automáticamente).

## Decisiones tomadas

- **Reasignación = "nunca automático"**: reasignar notifica y deja traza, pero NO
  marca `is_extra`. El pago extra se flaggea a mano desde la vista de completadas
  (acción existente `setAppointmentExtra`).
- **DnD = confirmar siempre** antes de aplicar (deja de ser instantáneo).
- **Mover fecha/hora edita la misma fila** (igual que el DnD), tanto en DnD como
  en el modal. Se reemplaza el camino actual del modal que creaba una cita nueva
  "reagendada" (`rescheduleAppointment`). Se pierde el registro del horario viejo,
  a cambio de consistencia y de que la cita le aparezca correctamente a la nueva
  terapista en `/agenda` y `/mi-dia`.

## Garantía de visibilidad (verificada)

- `/mi-dia`: `appointments.select().eq('therapist_id', userId)` (hoy + 3 días).
- `/agenda`: carga por rango; cliente filtra por `therapist_id`. RLS de SELECT =
  `is_agency_user()` OR `therapist_id = auth.uid()` ⇒ la nueva terapista lee la fila.
- `appointments` ya está en `supabase_realtime`.
- Como reasignar = UPDATE de `therapist_id` en la misma fila, la cita migra de
  agenda/mi-día de la vieja a la nueva sin clones.

## Modelo de datos — migración 0159 (`supabase/migrations/`)

> Repo va en 0158; siguiente número libre = **0159**. CLAUDE.md está desfasado
> (dice 0147) pero el repo ya tiene 0148–0158.

1. **Ampliar `mark_appointment_absence`** (misma firma → `create or replace`
   reemplaza, no crea sobrecarga): autorizar a admin · directora ·
   coordinadora_terapias · coordinadora_familias (además de la terapista de la
   cita). Resto del cuerpo verbatim de 0147 (incluye auto-`waived` de matutinos).
2. **Tabla `appointment_change_events`** (append-only, dirige notificaciones):
   - `id uuid pk`, `appointment_id uuid` (FK appointments ON DELETE CASCADE),
     `target_user_id uuid` (FK users — terapista a notificar),
     `actor_user_id uuid` (FK users — quién hizo el cambio),
     `change_kind text` CHECK in (`moved`,`reassigned_away`,`assigned`),
     `child_label text` (snapshot para mostrar), `starts_at timestamptz`
     (snapshot del horario relevante), `created_at timestamptz default now()`.
   - RLS: SELECT donde `target_user_id = auth.uid()`; INSERT con check
     `is_agency_user()` (las acciones server las insertan).
   - Agregar a `supabase_realtime`.
3. **Columna `appointments.reassigned_from_therapist_id uuid`** (FK users, null):
   traza de cobertura. Se setea al reasignar; se muestra como badge "Cobertura".
   - Tocar `Appointment` (interfaz) Y el tipo `Insert`/`Update` de `appointments`
     en el `Database` de `src/types/db.ts` (gotcha conocido).

## Server actions (`src/app/actions/appointments.ts`)

- `moveAppointment(id, start, end)`: ya hace UPDATE same-row. Añadir: emitir
  evento `moved` al `therapist_id` (si no cambió la terapista) tras mover.
- `reassignTherapist(id, newTherapistId)` **(nuevo)**: roles de gestión
  (DRAG_ROLES). Valida solape de la nueva terapista; UPDATE `therapist_id` +
  `reassigned_from_therapist_id = <vieja>`; emite `reassigned_away` (vieja) +
  `assigned` (nueva). Revalida `/agenda`, `/mi-dia`.
- Combinado (cambia fecha/hora **y** terapista): aplicar ambos; la nueva recibe un
  solo `assigned` con el horario nuevo; la vieja recibe `reassigned_away`.
- Eliminar uso de `rescheduleAppointment` desde el modal (queda la acción por si
  acaso, pero el modal usa move/reassign). Helper interno
  `emitAppointmentChangeEvent(...)` para insertar en la tabla.
- Solo `event_type='terapia'` participa de reasignación/cobertura/inasistencia
  anticipada; matutinos no.

## UI

- **`AgendaPageClient` (DnD)**: en `handleMove`, abrir diálogo de confirmación
  ("¿Mover la terapia de [niño] a [fecha/hora]?") antes de llamar a
  `moveAppointment`. Optimista solo tras confirmar.
- **`AppointmentForm` (modal edición)**:
  - Botón **"Marcar que no asistirá"** (terapias `scheduled`, roles de gestión) →
    confirma + motivo opcional → `markAbsence`.
  - Al guardar con cambios: detectar si cambió terapista y/o fecha/hora → diálogo
    de confirmación resumiendo el cambio y a quién se notifica → llamar a
    `reassignTherapist` y/o `moveAppointment`. Arreglar el bug de que cambiar
    fecha/hora pisaba el cambio de terapista.
- **`NotificationsDropdown`**: pintar nuevos subkinds de `appointment`
  (`movida`/`reasignada_salida`/`asignada_cobertura`) con texto e ícono.
- **Vista completadas** (`operacion/capacidad-terapistas/completadas`): badge
  "Cobertura" cuando `reassigned_from_therapist_id` no es null, junto al toggle de
  `is_extra` existente.

## Notificaciones (`/api/notifications/route.ts`, `useNotifications`)

- Nueva fuente: leer `appointment_change_events` con `target_user_id = me` y
  `created_at >= 7d`, mapear a `NotificationItem` kind `appointment` con subkind
  según `change_kind`. `id = apptchg-<event.id>` (dismissal localStorage existente).
- `useNotifications`: suscribir realtime a INSERT de `appointment_change_events`.
- Extender `NotificationItem['appointment_subkind']` y `db.ts`.

## Roles

- Pre-marcar inasistencia: admin, directora, coordinadora_terapias,
  coordinadora_familias (+ terapista de la cita). (Recepción: fácil de sumar luego.)
- Mover / reasignar: `DRAG_ROLES` (admin, directora, ambas coordinadoras, recepción).

## Fuera de alcance

- Marcar `is_extra` automático (explícitamente NO).
- Email/WhatsApp (solo feed in-app).
- Vista de agenda por columnas de terapista (no se puede "arrastrar a una terapista").
- Tocar programas matutinos.
