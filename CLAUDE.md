@AGENTS.md

# Kinetic CRM — Claude Context

## Proyecto
CRM operativo para **Kinetic** (clínica de terapias infantiles en El Salvador).
Maneja familias, niños/pacientes, citas terapéuticas, planes de tratamiento,
ausencias y reposiciones, informes cuatrimestrales, lista de espera interna,
capacidad de terapistas, dashboards diferenciados por rol, y portal para padres.

> **Nota histórica:** El codebase fue derivado de un CRM previo (FM Communication
> Solutions). Algunas tablas legacy (`requirements`, `review_assets`, `billing`,
> `invoices`, etc.) siguen presentes pero **no son centrales para Kinetic**. Su
> documentación detallada está al final de este archivo en la sección
> "Legacy FM — referencia". No tocar estos módulos sin razón.

## Privacidad de pacientes
**No usar nombres reales** de familias o niños en seeds, fixtures, ejemplos
ni comentarios. Kinetic atiende niños con diagnósticos sensibles. Usar siempre
apellidos ficticios (Zelaya, Escobar, Molina, etc.) y dominio `@ejemplo.com`.

## Stack
- Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind CSS 4
- shadcn/ui + @base-ui/react para componentes UI
- Supabase (Postgres + Auth + Storage + Realtime) — `@supabase/supabase-js@2`
- react-big-calendar + date-fns + date-fns-tz para calendarios
- @react-pdf/renderer para PDFs (legacy FM, también usable Kinetic)
- Rama principal: `master` (auto-deploy a Vercel)

## Comandos esenciales
```bash
npm run dev          # localhost:3000
npm run lint         # debe dar 0 errors nuevos antes de commit
npm run build        # verificación final de tipos y build
git add <files> && git commit -m "feat|fix|docs|chore: mensaje en español"
git push origin master  # rama de trabajo permanente
```

## Reglas de git
- **TODOS los commits van directo a `master`.** No usar feature branches por defecto.
- Si el harness designa una rama distinta (ej. `claude/...`), igual push a `master`
  con `git push origin HEAD:master`.
- Excepción: si el usuario pide explícitamente trabajar en otra rama.
- Commits en español (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).

## Reglas ESLint que muerden
- **`react-hooks/set-state-in-effect`**: No llamar `setState` sincrónicamente en `useEffect`. Estado derivado → `useMemo`.
- **`react-hooks/purity`**: Nunca `Date.now()` en render/hooks → usar `new Date().getTime()`.
- `redirect()` de `next/navigation` lanza internamente → siempre última línea en Server Actions.
- `@next/next/no-img-element`: usar `<Image>` de next/image o `{/* eslint-disable-next-line */}`.

## Supabase — dos clientes
```ts
// Server components / Server Actions:
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()   // ← async

// 'use client' components:
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()          // ← sync

// Admin / Service Role (Server Actions que necesiten bypass de RLS):
import { createAdminClient } from '@/lib/supabase/admin'
const supabase = createAdminClient()
```

## Patrones generales UI
- Colores primarios Kinetic: teal `#00675c` / rojo `#b31b25` / gris `#595c5e`
- CSS tokens: `fm-primary`, `fm-on-surface`, `fm-surface-container-*`, `fm-outline-variant`, `fm-error`. Heredados del proyecto FM pero usados en todo Kinetic.
- Tokens Kinetic adicionales: `kp-*` (palette portal).
- Dark mode: clase `dark` en `<html>` gestionada por `next-themes`.
- Iconos: Material Symbols (`<span className="material-symbols-outlined">icon_name</span>`).
- Todo texto UI en **español**. Mensajes de error también.

---

# Modelo de datos Kinetic

## Tablas centrales

```
families                    → familias (datos contacto del hogar)
  └─ family_members         → puente users(role='family') ↔ families
  └─ children               → niños/pacientes
       ├─ treatment_plans   → primary_therapist_id, therapies_json,
       │                      schedule_pattern_json, active
       ├─ appointments      → citas (event_type='terapia' | 'evaluacion' | ...)
       │   ├─ appointment_absences  → status: pending/replaced/waived
       │   └─ session_reports       → notas post-sesión
       └─ progress_reports  → informes cuatrimestrales (file mode default)
                              child_id × service_type × period_starts

waitlist_entries            → familias en espera (interno, no autoservicio)
therapist_work_schedule     → bloques laborales (therapist_id, dow, start, end)
users.max_hours_per_week    → cap semanal opcional (alerta si excede)
referral_sources            → de dónde viene la familia
monthly_session_cycles      → ciclos de pago/sesiones por mes
institutional_closures      → feriados, días no laborables
```

## Roles (`UserRole`)
- **Staff interno**: `admin` · `directora` · `supervisor` · `coordinadora_familias` · `coordinadora_terapias` · `terapista` · `maestra` · `recepcion` · `contable`
- **Portal padres**: `family`
- **Legacy FM (no usar para Kinetic)**: `client` · `operator`

## Service types (`ServiceType`)
`lenguaje`, `motricidad_gruesa`, `motricidad_fina`, `sensorial`, `psicologica`, `ocupacional`, `fisica`, `lectoescritura`, `funciones_ejecutivas`, `conductual`, `blue_kids`, `alim_deglu`, `destreza_manual_pre_escritura`, `otra`

Labels en `SERVICE_TYPE_LABELS` (db.ts). Paleta visual en `KINETIC_EVENT_PALETTES` (KineticCalendar.tsx).

## Estados de `appointments`
`scheduled` · `in_progress` · `completed` · `no_show` · `late_cancel` · `rescheduled` · `replacement` · `cancelled`

## Estados de `progress_reports`
`draft` · `submitted` · `approved` · `rejected` · `sent_to_family`

## Estados de `waitlist_entries`
`waiting` · `contacted` · `scheduled` · `dropped`

## Prioridades de `waitlist_entries`
`0` normal · `1` alta · `2` urgente (banner ámbar si >14 días sin atender)

---

# Arquitectura de archivos clave (Kinetic)

| Archivo | Rol |
|---------|-----|
| `src/types/db.ts` | Tipos TS manuales. Incluye AppUser, Appointment, Child, Family, TreatmentPlan, ProgressReport, WaitlistEntry, TherapistWorkScheduleBlock, etc. |
| `src/lib/domain/global-dashboard.ts` | Datos para dashboards por rol: `getMgmtDashboardData`, `getCoordTerapiasDashboardData`, `getRecepcionDashboardData` |
| `src/lib/domain/child-dashboard.ts` | KPIs y data del dashboard de un niño individual |
| `src/lib/domain/appointment.ts` | `appointmentsOverlap`, `findClosureAffecting`, helpers |
| `src/lib/domain/absence.ts` | Ventana de reposición (30d), `isAbsenceExpired` |
| `src/lib/domain/replacement-suggestions.ts` | Sugerencias automáticas de slots para reposición |
| `src/lib/domain/therapist-capacity.ts` | `calculateWeeklyOccupancy`, `startOfWeekMonday`, `occupancyToneClasses` |
| `src/lib/domain/waitlist-alerts.ts` | `detectWaitlistAlerts` — total + urgentes estancadas |
| `src/lib/domain/progress-reports-pending.ts` | `summarizeActiveTherapiesForTherapist`, `detectPendingProgressReportsAllTherapists`. **Filtra por primary_therapist_id** desde mayo 2026. |
| `src/lib/domain/treatment-plan.ts` | Lógica de planes |
| `src/app/actions/` | Server Actions (>30 archivos) |
| `src/app/actions/absences.ts` | `resolveAbsenceWithReplacement`, `waiveAbsence`, `getReplacementSuggestions`, `getTherapistCalendarWindow` |
| `src/app/actions/progress-reports.ts` | `createProgressReport` (sin templateId), `submitProgressReport`, `approveProgressReport`, etc. |
| `src/app/actions/therapist-schedules.ts` | `upsertScheduleBlock`, `deleteScheduleBlock`, `setMaxHoursPerWeek`, `getUserScheduleBlocks`, `getTherapistWeekOccupancy` |
| `src/app/actions/waitlist.ts` | `createWaitlistEntry`, `markContacted`, `markScheduled`, `dropEntry`, `reopenEntry`, `listWaitlist` |
| `src/contexts/UserContext.tsx` | `useUser()` (lanza si no hay) · `useUserOrNull()` |
| `supabase/migrations/` | Migraciones SQL — núcleo FM + extensiones Kinetic |
| `supabase/migrations-kinetic/` | Migraciones específicas de Kinetic (0095+) |

---

# Módulos / Páginas principales

## Operación (sidebar top-level)
- `/dashboard` — Dashboards diferenciados por rol (Mgmt / CoordTerapias / Recepcion)
- `/familias` — Listado de familias + dashboard por familia
- `/ninos` — Listado de niños cross-family
- `/mi-dia` — Vista del día para terapistas/maestras
- `/agenda` — Calendario semanal del equipo
- `/aprobaciones` — Inasistencias por reponer + informes cuatrimestrales pendientes
- `/operacion/lista-de-espera` — Lista de espera con filtros y prioridades
- `/inbox` — Chat interno del equipo (excluye family/client)
- `/tiempo` — Control de tiempo personal

## Administración (sidebar dropdown colapsable)
Visible si AL MENOS UN item es accesible al usuario. Cada item respeta su propio `allowedRoles`.
- `/users` — Equipo unificado con panel lateral (tabs Perfil / Horario / Capacidad)
- `/usuarios-portal` — Cuentas family
- `/operacion/capacidad-terapistas` — Tabla semanal comparativa de ocupación
- `/billing` — Facturación (FM legacy, can_quote también ve fallback top-level)
- `/admin/plantillas` — **DEPRECATED** (templates ya no se usan para informes nuevos)

## Portal padres (`/portal/*`)
- `/portal` — Inicio con próxima cita + alertas de inasistencias por reponer
- `/portal/agenda` — Calendario sticky a la izquierda + lista de citas a la derecha
- `/portal/familia` — Datos editables de la familia
- `/portal/calendario` — Calendario institucional read-only

Wrapper: `KineticPortalShell` (sin search bar en desktop; logout va a `/auth/signout`).

---

# Patrones clave

## Sidebar (`src/components/layout/Sidebar.tsx`)
- Top-level: items con `allowedRoles` opcional. Tiempo y Equipo (inbox) visibles para todos.
- **Administración**: grupo colapsable con items que tienen su propio `allowedRoles`. Se auto-abre si una ruta hija está activa.
- Para mostrar el grupo se requiere que AL MENOS UN item sea visible al usuario (`showAdminGroup`).
- Facturación tiene fallback top-level para usuarios `can_quote` que no son admin/directora.

## Calendarios (`KineticCalendar`)
- Wrapper unificado de react-big-calendar (`src/components/calendar/KineticCalendar.tsx`).
- Paleta de eventos: `KINETIC_EVENT_PALETTES` (key = service_type o tipo de evento).
- All-day row **oculta** vía CSS (`.calendar-wrapper .rbc-time-view .rbc-allday-cell { display: none }`) — Kinetic no usa eventos all-day operativos.
- Helper: `paletteFor(key)` → `{ bg, ring, text, accent }`.
- Localizador en español con `date-fns/locale/es`, semana inicia lunes.

## Informes cuatrimestrales
- **Modo `file` (en uso)**: terapista sube PDF/Word + notas para familia. No requiere plantilla.
- **Modo `editor` (deprecated)**: plantillas con bloques. No se usa para nuevos informes.
- `progress_reports.template_id` queda en `null` para informes nuevos.
- `progress_reports.upload_kind = 'file'` por defecto en `createProgressReport`.
- RPC `submit_progress_report` esquiva la validación de plantilla cuando `upload_kind='file'` (migración 0107).
- **Solo la terapista principal** del niño (`treatment_plans.primary_therapist_id`) ve el pendiente en `/aprobaciones` — filtrado agregado a `summarizeActiveTherapiesForTherapist` (Q2b).
- `ProgressReportApprovalList`, `ProgressReportApprovalCard` y `ProgressReportsList` (portal) manejan `template_id=null` con optional chaining → muestran solo el archivo.

## Ausencias y reposiciones
- Ventana de reposición: 30 días desde `reported_at` (`REPLACEMENT_WINDOW_DAYS`).
- RPC `resolve_absence_with_replacement` → crea cita replacement + marca absence como `replaced`.
- RPC `waive_absence` → marca como `waived` (no se repone).
- Server actions revalidan: `/aprobaciones`, `/agenda`, y `/familias/[fid]/children/[cid]` (este último consultando children→family_id).
- Modal de reagendamiento (`AbsenceRescheduleCard`) muestra calendario del terapista (`TherapistAvailabilityCalendar`) con sus citas + cierres institucionales + sugerencias destacadas en verde.

## Capacidad
- Función pura: `calculateWeeklyOccupancy(therapists, schedules, appointments, weekStart)` → `WeeklyOccupancy[]`.
- Color por % ocupación: verde <60, amarillo 60-85, rojo >85 (`occupancyToneClasses`).
- Excluye estados: `rescheduled`, `no_show`, `late_cancel`, `cancelled`.
- Tab Capacidad del perfil de usuario: ocupación real de la semana con week navigator inline (`getTherapistWeekOccupancy`).
- `WeekNavigator` (página standalone) recibe `weekStartParam: string` (no Date) para evitar bugs de zona horaria al serializar entre server (UTC) y client (SV, UTC-6).

## Lista de espera
- Tabla `waitlist_entries` con datos del niño, contacto padre, terapia requerida, terapista preferida opcional, prioridad 0/1/2.
- Server actions: `listWaitlist`, `createWaitlistEntry`, `markContacted`, `markScheduled` (link al child creado), `dropEntry` (con razón), `reopenEntry`.
- Banner ámbar en dashboard de coordinadora_terapias cuando hay entradas con `priority >= 1` esperando >14 días.
- No hay detección automática de slot liberado (manual por ahora).

## Dashboards por rol (`/dashboard`)
Routing en `src/app/(app)/dashboard/page.tsx` despacha a:
- **MgmtDashboard** (admin / directora): KPIs financieros mensuales + niños activos + pendings por rol + intake phases.
- **CoordTerapiasDashboard**: citas hoy/semana + inasistencias por reagendar + niños sin plan + niños sin terapista + lista de espera + banner urgentes.
- **RecepcionDashboard**: ingresos del mes + ciclos pagados/cancelados + niños sin cycle del mes.
- **TerapistaDashboard / MaestraDashboard**: vista personal con citas del día y pendings de informes.

---

# Migraciones

## Bloque base FM (`supabase/migrations/0001–0058`)
Ver sección "Legacy FM — referencia" al final. Sigue activo para pipeline, billing, review, inbox. No se modifica activamente.

## Bloque Kinetic (`supabase/migrations-kinetic/`)
| # | Contenido |
|---|-----------|
| 0095–0099 | Schema base Kinetic: families, children, appointments, progress_reports + plantillas, RLS portal |
| 0100 | treatment_plans + appointment_absences + RPCs (`resolve_absence_with_replacement`, `waive_absence`) |
| 0101–0106 | Iteraciones intermedias (ver historial) |
| 0107 | Fix `submit_progress_report` para esquivar validación de plantilla en `upload_kind='file'` |

## Bloque Kinetic en `supabase/migrations/`
| # | Contenido |
|---|-----------|
| 0108 | `progress_reports.upload_kind` (`editor`|`file`) + `file_url` |
| 0114 | `progress_reports.family_notes` (notas para padres en cuatrimestrales) |
| 0115 | `therapist_work_schedule` + `users.max_hours_per_week` |
| 0116 | `waitlist_entries` + enum `waitlist_status` |

> **IMPORTANTE**: aplicar migraciones manualmente en Supabase Dashboard. No hay
> migración automática. Ver `supabase/migrations*/` y revisar cuáles no
> están aplicadas en el ambiente.

---

# Estado del proyecto — mayo 2026

## Completado en sesiones recientes
1. **Stage A** — Calendario del terapista en modal de reagendamiento (`/aprobaciones`)
2. **Stage B** — Dashboard de capacidad + configuración de horarios laborales
3. **Stage C** — Lista de espera interna
4. **Sidebar** reorganizado con grupo Administración colapsable
5. **Página `/users` unificada**: equipo + horario + capacidad en panel lateral con 3 tabs
6. **Tab Capacidad** con ocupación real + week navigation inline
7. **Refactor informes**: sin plantilla, solo tipo de terapia + archivo + notas familia
8. **Portal padres**: calendario sticky, click-detail por día, chip de terapista, alertas de inasistencias
9. **Fixes operativos**:
   - Contador "pendiente reponer" revalida path correcto del dashboard niño
   - Navegación de semanas en Capacidad equipo (fix de timezone server/client)
   - Aprobaciones filtran solo terapista principal del niño
   - Inbox excluye cuentas family
   - All-day row del calendario oculta
   - Panel de perfil scrolleable correctamente

## Pendiente (próximas sesiones)
- 📋 **Reportería** (puntos 9 y 10 del plan original) — siguiente foco
- Plantillas (`/admin/plantillas`): dejar zombie hasta que no haya informes históricos con `template_id`. Luego: borrar página, action `listReportTemplates`, referencias en approval/portal lists, y finalmente la tabla `report_templates`.
- (Backlog) Detección automática de slot liberado tras cancelar cita → alerta a lista de espera
- (Backlog) Notificaciones a familias en waitlist por email/WhatsApp
- (Backlog) Vista mensual/anual de capacidad (actual es solo semanal)
- (Backlog) Formulario público de solicitud de cita (waitlist autoservicio)

---

# Legacy FM — referencia

> Esta sección documenta lo que viene del CRM original FM Communication Solutions.
> Estos módulos **siguen funcionales** en el codebase pero **no son centrales
> para Kinetic**. Tocar solo si es necesario.

## Modelo de datos FM
```
users (role: admin | supervisor | operator | client)
clients → billing_cycles → requirements → requirement_phase_logs
                                       ↘ requirement_messages
                                       ↘ review_assets → review_versions → review_pins → review_comments
client_users (puente clients ↔ users role='client')
```

## Pipeline FM (12 fases internas / 5 fases portal)
Internas: `pendiente, proceso_edicion, proceso_diseno, proceso_animacion, cambios, pausa, revision_interna, revision_diseno, revision_cliente, aprobado, pendiente_publicar, publicado_entregado`
Portal: `diseno, revision_cliente, aprobado, pendiente_publicar, publicado` (mapping en `clientPhaseOf()`).

## Módulo Billing FM
`invoices`, `quotes`, `payment_methods`, `terms_and_conditions`. PDFs vía `@react-pdf/renderer` en `src/app/api/{invoices,quotes}/`. Edge Function `daily-cycle-runner`.

## Sistema de revisión FM
`review_assets` → `review_versions` → `review_pins` → `review_comments`. Bucket `review-files` (privado). RLS gated por `requirements.phase='revision_cliente' + is_client_of(client_id)`.

## Storage buckets (compartidos con Kinetic)
| Bucket | Visibilidad | Uso |
|--------|------------|-----|
| `client-logos` | Público | Logos de clientes FM |
| `agency-assets` | Privado | Assets de la agencia |
| `requirement-attachments` | Público | Adjuntos FM |
| `review-files` | Privado | Sistema de revisión FM |
| `avatars` | Público | Avatares de usuarios |
| `reports-files` | Privado | **Kinetic** — archivos de informes cuatrimestrales |

## Realtime FM
Tablas en publicación `supabase_realtime`: `messages`, `conversations`, `conversation_members`, `review_assets`, `review_versions`, `review_pins`, `review_comments`, `review_comment_mentions`, `review_version_files`, `requirement_messages`, `notifications`.

## Migraciones FM (0001–0058) — resumen ultra-breve
- 0001–0006: schema inicial + pipeline base
- 0007: bucket client-logos
- 0008–0009: rename consumptions→requirements + cambios
- 0010–0018: chat, billing inicial, time entries, supervisor, distribución semanal
- 0019: 12 fases del pipeline
- 0020–0039: multi-asignación, time entries fixes, RLS, distribución overrides
- 0040–0043: inbox chat (DMs/canales/menciones)
- 0044–0047: sistema de revisión + bucket review-files
- 0048: módulo billing completo
- 0049–0051: realtime + calendar_events
- 0052–0055: portal cliente + RLS + storage policy
- 0056–0058: realtime para messages/notifications
- 0059: multi-consumo + anulación de cambios
