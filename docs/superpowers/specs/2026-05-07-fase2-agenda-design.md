# Fase 2 — Agenda + cierres institucionales (slice C)

**Status:** approved (4/4 secciones aprobadas en brainstorming session 2026-05-07)
**Plan reference:** `~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md` v0.7 — Fase 2
**Slice scope:** **C** (Vertical slice sin Google Meet ni cron) — confirmado por usuario

## Contexto

Kinetic CRM tiene Fase 1 (familias + niños) entregada. Fase 2 agrega la **agenda de citas** que es el core operativo del centro vespertino (terapias por cita) y permite ver eventos del programa matutino. El plan completo de Fase 2 es ~1.5–2 semanas; este spec cubre el slice C (todo menos integraciones externas Google Meet + cron).

## Out of scope

- **Google Meet vía Calendar API** (depende de acceso admin Workspace de Kinetic — sesión siguiente)
- **Recordatorios cron 24h/1h** (depende de Edge Function setup en Supabase — sesión siguiente)
- **Generación automática de instances desde rrule** (Fase 4: motor de reposiciones)
- **Validación "estar al día con pago"** (Fase 7)
- **Drag & drop en calendar** (Fase 4)

## Modelo de datos

Migración: `supabase/migrations-kinetic/0092_kinetic_appointments.sql`

### `appointments`
Tabla principal — todos los eventos clínicos vivien acá (terapias, entrevistas, reuniones, evaluaciones, programa matutino).

```
id uuid pk
child_id uuid fk children
therapist_id uuid fk users (nullable si event_type != 'terapia')
event_type text check ('terapia'|'entrevista_directora'|'reunion_padres'|'reunion_colegio'|'evaluacion'|'programa_matutino')
service_type text nullable check (10 valores: lenguaje, motricidad_gruesa, motricidad_fina, sensorial, psicologica, ocupacional, fisica, lectoescritura, funciones_ejecutivas, conductual, otra)
modality text check ('presencial'|'virtual')
starts_at timestamptz
ends_at timestamptz
status text default 'scheduled' check ('scheduled'|'in_progress'|'completed'|'no_show'|'late_cancel'|'rescheduled'|'replacement')
parent_appointment_id uuid fk self nullable (para reposiciones — Fase 4 implementa motor)
recurrence_rule text nullable (rrule RFC 5545 — placeholder Fase 4)
google_calendar_event_id text nullable (Fase 2 next session)
meet_link text nullable (Fase 2 next session)
notification_sent_24h bool default false
notification_sent_1h bool default false
notes text nullable
created_by_user_id uuid fk users
created_at timestamptz default now()
updated_at timestamptz default now()
```

Constraint: `ends_at > starts_at` y duración ≥ 15 min.
Constraint: `event_type='terapia'` ⇒ `service_type` y `therapist_id` requeridos.
Index: (therapist_id, starts_at), (child_id, starts_at), (starts_at) DESC, (status) WHERE != 'completed'.

### `institutional_calendar`
```
id, date date, type text ('holiday'|'closure'|'gov_decree'|'kinetic_break'),
name text, description text nullable, all_day bool default true,
year_recurring bool default false (Semana Santa, etc.)
created_at, updated_at
```

### `virtual_meetings`
Provider-agnostic registry (preparado para Google Meet en sesión next).
```
id, appointment_id fk appointments cascade nullable,
context text ('therapy'|'directora_interview'|'parents_meeting'|'school_meeting'|'evaluation'),
provider text default 'google_meet',
external_event_id text, join_url text, scheduled_for timestamptz, ends_at timestamptz,
status text default 'scheduled', created_by_user_id, created_at
```

### `google_workspace_config`
Singleton para Service Account (vacío en este slice — sesión next).
```
id, service_account_email, calendar_id_master, dwd_active bool default false,
default_owner_email, configured_at
```

## RLS

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| appointments | agency_user OR therapist_id=self OR is_family_of_child(child_id) | admin/supervisor/directora/coord_terapias/recepcion | igual + terapista (su cita, solo notes/status restringido) | admin |
| institutional_calendar | agency_user OR cualquier family_user | admin/directora | admin/directora | admin |
| virtual_meetings | igual a appointments | igual a appointments | igual | admin |
| google_workspace_config | admin | admin | admin | admin |

Helper SQL nuevo: `is_family_of_child(child_uuid) returns boolean` — usa existing `is_family_member` + lookup en `children.family_id`.

## Server actions

`src/app/actions/appointments.ts`:
- `createAppointment(input)` — valida solapamiento + cierre institucional + estado del niño
- `updateAppointment(id, patch)`
- `rescheduleAppointment(id, new_starts_at, new_ends_at, reason?)`
- `cancelAppointment(id, reason)`
- `markAppointmentInProgress(id)` (terapista)
- `markAppointmentCompleted(id, notes?)` (terapista)
- `listAppointmentsInRange(from, to, filters?)`
- `listMyAppointmentsToday()` (shortcut terapista)
- `listAppointmentsForFamily(family_id)` (shortcut portal padre)

`src/app/actions/institutional-calendar.ts`:
- `listInstitutionalClosures(year?)`
- `addInstitutionalClosure(input)`
- `removeInstitutionalClosure(id)`

`src/lib/domain/appointment.ts`:
- `EVENT_TYPE_LABELS`, `SERVICE_TYPE_LABELS`, `STATUS_LABELS`, `STATUS_COLORS`
- `appointmentsOverlap(a, b)` — utility para validación cliente
- `isWithinClosure(starts_at, ends_at, closures)` — utility para validación cliente
- `defaultDurationFor(eventType)` — 30 min terapia, 60 min entrevistas/reuniones

## UI

### `/agenda` (staff)
- Server component fetcha `appointments` del rango visible + `institutional_calendar` + lista de terapistas + lista de niños activos.
- Client component `AgendaPageClient`:
  - react-big-calendar con `views=['month','week','day']`
  - Localizer `date-fns` con `es` locale
  - Click slot vacío → abre `AppointmentForm` modal con starts_at prellenado
  - Click evento → abre `AppointmentForm` modal en modo edit
  - Cierres institucionales pintan el día con `bg-fm-error/5` y label
  - Sidebar derecho fijo con filtros (chips multi-select de terapista, event_type, toggle "solo virtuales")

### Therapist view
- Si `role='terapista'`: filtro de terapista pre-aplicado y bloqueado. Resto igual.
- Adicional widget en `/dashboard` (server component existente) "Mi día de hoy" → top 5 citas de hoy.

### `/portal/agenda` (padre)
- Server fetcha appointments de los niños del padre (vía RLS).
- Lista cronológica simple, no calendar grid.
- Card por cita: niño, fecha/hora, terapista, modalidad badge, service_type label.
- Si modality='virtual' y `meet_link` y faltan ≤10 min → botón "Unirse a la reunión".
- Filtro por niño si la familia tiene varios.

### Modal `AppointmentForm`
- Reusa pattern de `useDialogA11y` (ya existe).
- Single screen, no wizard.
- Pasos visibles:
  1. event_type (radio chips)
  2. child autocomplete
  3. service_type + therapist (si event_type='terapia')
  4. modality
  5. fecha + hora_inicio + duración (default 30 min)
  6. notes
- Submit: `createAppointment` o `updateAppointment` según modo.
- Inline warnings: solapamiento (terapista en otro slot), cierre institucional, niño con tratamiento_status restringido.

## Sidebar

Reorden: `Pipeline / Familias / Agenda (NUEVO) / Calendario (legacy, admin-only) / Reportes / ...`
Icono: `calendar_month`.

## Tests

`tests/e2e/agenda.spec.ts`:
- `/agenda` redirige a /login sin auth
- (Tests con auth quedan para cuando agreguemos un fixture de login en sesión siguiente)

## Plan de implementación

Archivos a crear/modificar (10 nuevos + 2 modificados):
1. `supabase/migrations-kinetic/0092_kinetic_appointments.sql`
2. `src/types/db.ts` (append types)
3. `src/lib/domain/appointment.ts`
4. `src/app/actions/appointments.ts`
5. `src/app/actions/institutional-calendar.ts`
6. `src/app/(app)/agenda/page.tsx`
7. `src/app/(app)/agenda/AgendaPageClient.tsx`
8. `src/components/agenda/AppointmentForm.tsx`
9. `src/components/agenda/AgendaCalendar.tsx`
10. `src/components/agenda/AgendaFilters.tsx`
11. `src/app/(portal)/portal/agenda/page.tsx`
12. `src/app/(portal)/portal/agenda/PortalAgendaList.tsx`
13. `src/components/layout/Sidebar.tsx` (modify)
14. `tests/e2e/agenda.spec.ts`

## Verificación

- `npx eslint <files>` → 0 errors
- `npx playwright test smoke` → 3/3 + nuevo agenda smoke pasa
- Migration corre limpia en Supabase Kinetic (idempotente con `if not exists`)
- Visual: sidebar muestra "Agenda" con icono, ruta carga sin errores

## Riesgos identificados

1. **react-big-calendar y dark mode** — el lib es notoriamente difícil de tematizar. El proyecto FM legacy ya tiene CSS overrides en `globals.css`. Reuso esos overrides (clase `calendar-wrapper`).
2. **Performance con muchas citas** — fetch del rango visible (mes ≈ 100-300 citas) está OK. Si crece, paginar por semana en queries.
3. **RLS recursive** — la policy de family debe usar `is_family_member` lookup vía join o subquery; cuidado con N+1 en RLS.

## Decisiones de diseño confirmadas

- Modelado: todos los eventos en `appointments` con `event_type` enum (no tabla separada para no-terapias)
- Coexistencia: `/calendario` legacy se queda visible para admin; `/agenda` es la ruta Kinetic-flavored
- Calendar lib: react-big-calendar (mismo que FM legacy, consistencia + cero dependencia nueva)
- Modal vs side-panel: modal con focus trap (consistente con FamilyForm/ChildForm)
- Slot duration default: 30 min (terapia estándar Kinetic)

---

**Aprobado por usuario en chat 2026-05-07. Procede a implementación directa.**
