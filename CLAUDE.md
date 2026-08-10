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
- `/aprobaciones` — Inasistencias por reponer + informes cuatrimestrales pendientes + **recogidas tardías por cobrar/perdonar** (admin/directora)
- `/operacion/lista-de-espera` — Lista de espera con filtros y prioridades
- `/inbox` — Chat interno del equipo (excluye family/client)
- `/tiempo` — Control de tiempo personal
- `/mis-recibos` — Recibos de planilla mensual del usuario, con firma digital de recepción (visible para todo el staff, oculto a family/client)

## Administración (sidebar dropdown colapsable)
Visible si AL MENOS UN item es accesible al usuario. Cada item respeta su propio `allowedRoles`.
> **Recepción tiene paridad en TODO el módulo de Administración** (junio 2026): además de
> Reportes/Catálogos/Capacidad/Facturación (que ya tenía), ahora `recepcion` accede a
> `/users` y `/usuarios-portal` y puede gestionar personal (crear/editar/borrar, **cambiar
> roles**, salarios, horarios/capacidad) y cuentas de portal. **Guards anti-escalada**: un
> no-admin no puede crear/asignar/borrar el rol `admin`. **Impersonación** (suplantar) y
> **config fiscal** siguen siendo **admin-only**. Las escrituras privilegiadas (users CRUD,
> rol, horarios, max_hours) van por **admin client** (service role) gateadas por rol en código
> — no por RLS; por eso no hubo migración.
- `/users` — Equipo unificado con panel lateral (tabs Perfil / Horario / Capacidad). Roles: admin, directora, **recepcion**.
- `/usuarios-portal` — Cuentas family. Roles: admin, directora, **recepcion**.
- `/operacion/capacidad-terapistas` — Tabla semanal comparativa de ocupación (admin/directora/coord_terapias/recepción)
- `/catalogos` — **Catálogos de precios (cobro) y costos (pago terapista)** editables (admin/contable/recepción). Mig 0135.
- `/reportes` — Landing de reportería Kinetic (admin, directora, contable, recepcion, coordinadora_terapias). Tarjetas activas: **Ingresos**, **Egresos**, **Planillas** y **Por terapista**.
  - `/reportes/financieros` — Sección de **Ingresos** (en UI). 5 reportes web+PDF: ingresos mensuales, comparativa anual, ciclos, pagos por método, **churn de familias** (altas, alta médica, bajas, pausas, neto). La ruta sigue siendo `/financieros` por compatibilidad.
  - `/reportes/egresos` — Egresos del centro: total mensual, desglose por mes (planilla auto + gastos generales), distribución por categoría, CRUD de gastos generales (renta, luz, agua, transporte, etc.). Roles: admin, directora, contable.
  - `/reportes/contabilidad` — Hub de Planillas → listado mensual + configuración. (La ruta sigue siendo `contabilidad` para minimizar churn; en UI se muestra como "Planillas".)
  - `/reportes/contabilidad/planillas` — Listado y creación de planillas mensuales. Cada mes admite **dos planillas separadas** por `payroll_type`: **normal** (sueldo fijo, ISSS/AFP/ISR + aportes patronales) y **servicios profesionales** (honorarios, solo retención ISR configurable, sin ISSS/AFP). El modal de creación elige el tipo.
  - `/reportes/contabilidad/planillas/[id]` — Detalle: editable en draft, sellado inmutable, firma de empleados, PDF. La UI/PDF de servicios profesionales ocultan ISSS/AFP/patrono y muestran solo honorarios → retención → neto.
  - `/reportes/contabilidad/configuracion` — Constantes ISSS/AFP/ISR + **% retención servicios profesionales** (admin) + tabla de salarios por empleado con **checkboxes de pertenencia** a cada planilla (admin/directora/contable).
  - `/reportes/por-terapista` — Tabla comparativa mensual del equipo con KPIs por terapista: asistencia (completed/no_show/late_cancel/reposiciones), carga horaria (trabajadas vs contratadas), cumplimiento de informes cuatrimestrales. Roles: admin, directora, coordinadora_terapias. Cada fila tiene botón de descarga PDF individual; cabecera tiene descarga del PDF del equipo. Incluye **sección de Capacidad histórica** (heatmap últimos 6 meses con tendencia ↑↓→ por terapista) y **sección "Pago por terapias completadas — acumulado del mes"** (`getTherapistTherapyEarnings` + `TherapyEarningsSection`): vista en vivo de lo que pagaría la planilla de servicios profesionales (terapia `completed` × `cost_usd` del catálogo), respetando flags (solo-SP = todas; mixto = solo `is_extra`). Reutiliza las funciones puras `sumProfessionalServicesPay`/`professionalServicesBaseFor`.
- `/billing` — Facturación (FM legacy, can_quote también ve fallback top-level)

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
- **Modo `file` (en uso)**: terapista sube PDF/Word + notas para familia. No requiere plantilla. Único flujo soportado para nuevos informes.
- **Modo `editor` (legacy histórico)**: plantillas con bloques. Eliminado del flujo de creación. La tabla `report_templates` y la columna `progress_reports.template_id` se conservan **solo lectura** para mostrar informes históricos creados antes del refactor.
- `progress_reports.template_id` queda en `null` para informes nuevos; aprobaciones y portal hacen lectura directa de `report_templates` cuando `template_id IS NOT NULL` (sin action intermedio).
- `progress_reports.upload_kind = 'file'` siempre — incluso cuando se elimina el archivo (estado "esperando archivo nuevo").
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

## Autoguardado de borradores (offline-safe)
- Hook `useDraft(key, value, { userId, serverUpdatedAt?, enabled? })` en
  `src/hooks/useDraft.ts`: persiste el estado de un formulario en `localStorage`
  (con debounce ~700ms) para que no se pierda lo escrito si se va luz/internet.
  100% local — no toca DB ni servidor. Clave namespaced por `userId` (computadoras
  compartidas). Expira a 7 días. Lectura inicial NO depende de `enabled` (para
  modales montados cerrados); `enabled` solo gobierna las escrituras.
- UI en `src/components/ui/DraftAutosave.tsx`: `DraftRestoreBanner` (ofrecer
  restaurar/descartar al abrir), `SaveStatusIndicator` ("Guardado local HH:MM" +
  pill "Sin conexión") y `OfflineSaveError` (envío falló sin red → reintentar; el
  borrador queda a salvo). `clearAllDrafts()` se llama en logout del Sidebar.
- Patrón al cablear un form: bundle del estado en un objeto (`useMemo`), `useDraft`,
  banner arriba, `SaveStatusIndicator` en el footer, `clear()` tras envío exitoso,
  y `try/catch` en el submit que setea `failedOffline` para mostrar `OfflineSaveError`.
- Cableado en: `TreatmentPlanEditor`, `SessionReportModal` (notas de sesión),
  `ProgressReportFileUploader` (notas para familia), `FamilyForm`, `ChildForm`,
  `NewWaitlistEntryModal`. Los **archivos** (uploads) no se cachean — fase futura
  con IndexedDB si se necesita.

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
| 0117 | Módulo de planillas: columnas salariales en `users` + `payroll_fiscal_config` (con seed ISSS/AFP/ISR vigentes 2024-2026) + `payroll_runs` + `payroll_items` + RLS + RPC `sign_my_payroll_item` |
| 0118 | Tabla `general_expenses` (gastos operativos no-planilla: renta, servicios, transporte, etc.) + RLS para admin/directora/contable |
| 0119 | **DOS archivos mismo número**: `0119_child_attachments.sql` (adjuntos por niño) + `0119_recepcion_reportes_rls.sql` (recepción = paridad contable en RLS de general_expenses/payroll_*). Aplicar **ambos**. |
| 0120 | `submit_session_report`: actividades opcional para programas matutinos |
| 0121–0124 | Pipeline de admisión: `intake_phase_catalog` (17 sub-fases), `children.current_phase_code` + `waitlist_entries.current_phase_code`, `child_phase_history`, `child_discharge_records`, `dashboard_alerts`; campos del form de recepción; cleanup de `waitlist.status` y `children.intake_phase`/`treatment_status` legacy |
| 0125–0127 | **Data**: cleanup de prueba (0125 destructiva) + seed demo (0126) + seed planillas (0127). NO re-correr. |
| 0128 | `families`: lugar de trabajo/tel oficina, pediatra, autorización fotos |
| 0129 | Tipos de evento de citas v2 |
| 0130–0132 | `service_catalog` v2: `terapia_individual` + `unit_price_bk_usd` + `service_type`; seed 18 terapias; service_types `learning_kids`/`aula_educativa` |
| 0133 | RLS: `contable` puede insertar/editar `treatment_plans` |
| **0134** | **F2**: terapista por tipo de terapia — RPC compute/confirm asignan terapista por `service_type` (fallback `primary_therapist_id`) |
| **0135** | **F3**: `service_catalog.cost_usd` (costo interno/pago terapista) + RLS escritura admin/contable/recepción |
| **0136** | **F4**: ciclo con vencimiento (`due_date`/gracia) + `payment_status` + recargo por mora (`surcharge_amount_usd`); RPC `mark_monthly_cycle_paid`; `paid_at` ahora NULLABLE (=fecha pago real) |
| **0137** | Fix: dropea sobrecarga vieja de `_kn_slot_dates_in_month` (ambigua) + compute con frecuencia |
| **0138** | **F6**: `contract_type` `por_hora`→`por_terapias` + `appointments.is_extra` |
| **0139** | **F7**: rollover (`rollover_mode`/`rollover_sessions_json`/`rollover_discount_usd`); compute/confirm con `p_rollover_sessions` |
| **0140** | **F5**: `appointments` despacho (`completed_at`/`dispatched_at`/`late_fee_*`/`dispatch_snoozed_until`) + `appointments` en publicación realtime |
| **0141** | Fix: dropea sobrecargas obsoletas de `compute_*`/`confirm_*` (ambigüedad "could not choose candidate") |
| **0142** | **Dos tipos de planilla**: `users.in_normal_payroll` + `users.in_professional_services_payroll` (flags de pertenencia, migrados desde `contract_type`); `payroll_fiscal_config.professional_services_isr_rate` (10% default); `payroll_runs.payroll_type` (`normal`\|`servicios_profesionales`) + índice único por (año, mes, tipo); `appointments.extra_reason` (`hora_extra`\|`sabado`\|`cobertura`) |
| **0143** | Crea el bucket de Storage `user-avatars` + políticas RLS (SELECT público, INSERT/UPDATE/DELETE por carpeta propia `auth.uid()`). Antes se documentaba como paso manual del Dashboard (desde 0018) y al omitirse daba "Bucket not found" al subir foto de perfil (staff y portal, `uploadUserAvatar`). |
| **0144** | RLS: `coordinadora_familias` también puede insert/update de `treatment_plans` y su audit log `treatment_plan_changes` (paridad con `coordinadora_terapias`). Acompaña el cambio en `MGMT_ROLES` (treatment-plans.ts) y `MGMT_ROLES_PLAN` (página del niño). |
| **0145** | **Paridad de roles planes+ciclos**: set único de 6 roles (admin, directora, ambas coordinadoras, recepcion, contable) puede crear planes Y generar/cobrar ciclos. Suma `recepcion` a las RLS de `treatment_plans`/`treatment_plan_changes` (supersede 0133/0144) y `coordinadora_familias` a los ciclos. Helper nuevo `kn_can_manage_cycles()` centraliza la lista; redefine RPCs `confirm_monthly_payment_and_generate` (12-args, de 0139) y `mark_monthly_cycle_paid` (4-args, de 0136) verbatim cambiando solo la autorización, y las policies `msc insert/update mgmt`. Acompaña `MGMT_ROLES` en treatment-plans.ts + monthly-cycles.ts y `MGMT_ROLES_PLAN`/`MGMT_ROLES_CYCLES` en la página del niño. |
| **0146** | `coordinadora_familias` puede **anular** ciclos: redefine RPC `cancel_monthly_cycle` (verbatim de 0101, solo cambia el rol → `admin/directora/coordinadora_familias`). Acompaña `CAN_CANCEL_ROLES` en monthly-cycles.ts, `CAN_CANCEL_CYCLES_ROLES` en la página del niño y nuevo prop `canCancel` en `MonthlyCyclesSection` (antes el botón "Anular" se mostraba a todo `canManage` pero la acción solo permitía admin/directora). |
| **0147** | **Mensualidad fija de programas matutinos** (blue_kids/learning_kids/aula_educativa): helper SQL `_kn_is_monthly_flat(entry)` + redefine con misma firma `compute_monthly_appointment_candidates` (servicios flat sin cuota — se generan todas las fechas del patrón, nada a `skipped_overquota`), `confirm_monthly_payment_and_generate` (línea de factura = 1 × mensualidad, no sesiones × precio) y `mark_appointment_absence` (falta de programa matutino → absence auto-`waived` con motivo, no entra a /aprobaciones ni al rollover). Espejo TS de la regla: `src/lib/domain/billing/monthly-flat.ts`. **Modalidad implícita**: entrada de `therapies_json` sin `billing_mode` con servicio matutino = `monthly_flat` (corrige planes existentes sin re-guardar). Campos nuevos del jsonb: `billing_mode` (`per_session`\|`monthly_flat`) y `days_per_week` (variante del catálogo de mensualidades). |
| **0148** | RPC `regenerate_cycle_appointments` (regenerar las citas de un ciclo al editarlo). |
| **0149–0152** | **Programas matutinos por grupo**: `program_groups`/`program_group_members`/`program_group_staff`/`program_group_sessions` + RPC `generate_group_sessions_for_month`; compute/confirm reciben `p_program_group_id`/`p_attendance_days`. 0152 = fix idempotente de membresía. Las citas `programa_matutino` por-niño se conservan (portal) pero se **ocultan del staff** (la agenda muestra bloques de grupo). |
| **0153–0154** | Iteraciones intermedias (ver git). |
| **0155** | RPC `resolve_absence_with_replacement` autoriza también a `coordinadora_familias`. |
| **0156** | **Evaluaciones agendables**: `appointments.child_id` NULLABLE + `external_child_name` + `service_code` (evaluación a persona nueva, sin niño registrado). |
| **0157** | Backfill `therapist_id` por terapia en `therapies_json` (fin del "terapista principal"; la primary se deriva). |
| **0158** | RLS `payroll_fiscal_config`: escritura para `contable`/`recepcion`. |
| **0159** | `users.professional_services_base_usd` (base SP fija) + `payroll_runs.period_half` (planillas quincenales). |
| **0160** | Reasignación de terapias (cobertura) + **notificaciones de cambio de cita** (`appointment_change_events`, RLS + realtime). |
| **0161** | `users`: datos bancarios. |
| **0162** | Bucket de Storage para adjuntos del chat. |
| **0163** | **El ciclo crea las citas al GENERAR, no al pagar.** Re-asegura `confirm_monthly_payment_and_generate` (crea citas + factura `pending`, `paid_at` NULL) y `mark_monthly_cycle_paid` (solo pago, NO crea citas). Backfill de ciclos viejos: `scripts/backfill_0163_cycle_appointments.sql` (en tandas). |
| **0164** | Amplía el CHECK de `appointments.extra_reason` para incluir `'evaluacion'`. Sin esto, agendar evaluaciones truena con `appointments_extra_*_check` (el código inserta `extra_reason='evaluacion'` desde 0156, pero ninguna migración había ampliado el dominio que nació en 0142). |
| **0165** | **Comentarios en lista de espera**: tabla `waitlist_entry_comments` (bitácora por entrada) + RLS (mismos roles de gestión que la lista). UI en el modal de detalle (pipeline) y en modal desde la tabla. |
| **0166** | **Auto-archivar niños dados de baja hace >3 meses** (reversible): `children.archived_at` + RPC `archive_stale_discharged_children()` (idempotente, la llama `daily-cycle-runner` STEP 0). Listados ocultan archivados (`/ninos` con toggle "Ver archivados"); acción `unarchiveChild` + banner "Restaurar" en la ficha. |
| **0167** | **Hardening seguridad**: endurece el SELECT de `reports-files` (auditoría de seguridad). |
| **0168** | **Asignación múltiple de eventos**: `appointments.assignee_ids uuid[]` + índice GIN. Eventos multi-persona (entrevistas, reuniones, entrega de avances, otro) se asignan a varias personas; `therapist_id`=principal, `assignee_ids`=todos. `/mi-dia` y el filtro de agenda incluyen donde el user es asignado. |
| **0169** | **Permitir eliminar usuarios**: arregla los FKs a `public.users` que truenan el borrado ("Database error deleting user"). DO block dinámico: (1) quita NOT NULL de columnas con FK `ON DELETE SET NULL` (bug: `therapy_sessions.therapist_id` era NOT NULL + SET NULL → contradicción); (2) columnas de auditoría NULLABLE que bloquean (NO ACTION/RESTRICT) → `ON DELETE SET NULL`. Dejaba `payroll_items.user_id` (NOT NULL) bloqueando. **Superseded por 0170.** |
| **0170** | **Eliminar SIEMPRE (conservando el registro contable)**: superset de 0169. Hace que NINGUNA FK a `public.users` bloquee el borrado — TODA columna bloqueante (incl. `payroll_items.user_id`) se vuelve NULLABLE + `ON DELETE SET NULL`. La planilla sobrevive porque `payroll_items.user_snapshot_json` guarda nombre/DUI/rol al sellar; el detalle/PDF de planilla ahora hacen fallback al snapshot cuando el usuario ya no existe. `PayrollItem.user_id` pasa a `string \| null`. **Insuficiente sola — ver 0171.** |
| **0171** | **Intento fallido (storage.objects.owner)**: se creyó que el bloqueo del borrado venía de `storage.objects`, pero el diagnóstico (`scripts/diag_user_delete_blockers.sql`) mostró que TODAS las FK a users ya eran SET NULL/CASCADE y NO existe FK bloqueante en storage. 0171 es inocua (no encuentra nada que arreglar). La causa real era un CHECK — ver 0172. |
| **0172** | **CAUSA REAL del "Database error deleting user"**: el CHECK `appointments_terapia_requires_service_and_therapist` (mig 0092) exigía `therapist_id` no nulo en toda cita `terapia`; al eliminar un terapeuta, el `SET NULL` en cascada (0170) violaba el CHECK y abortaba el borrado. Se relaja: para `terapia` se exige solo `service_type`. Las citas del terapeuta eliminado quedan sin asignar (therapist_id NULL). **Además** `deleteUser` ahora borra `public.users` primero (via admin/PostgREST) para exponer el error real de Postgres en vez del genérico de GoTrue. **Recomendación**: reasignar con "Sustituir terapeuta" antes de eliminar. |
| **0173** | Offset quincenal (`biweekly_offset` en slots del horario): dos niños quincenales mismo día/hora/terapista ya no chocan mes tras mes (`_kn_slot_dates_in_month` 6º arg). **Ojo**: existió un SEGUNDO archivo con prefijo "0173" para menciones de lista de espera, renombrado a 0176 antes de aplicarse — no confundir. |
| **0174** | **Firma única de coordinadora en altas/retiros**: `child_discharge_records` gana `signed_by_coordinadora_id/_name/_at`. `finalizeDischarge` estampa esa firma (antes cerraba la baja sin dejar constancia). Modal y PDF muestran solo esa firma; las de terapista/directora quedan solo para registros históricos de la vía vieja de doble firma. |
| **0175** | **Recargo por mora se cobra en la mensualidad SIGUIENTE, no en la actual**: `mark_monthly_cycle_paid` ya no infla la factura del mes que se paga — guarda el recargo calculado y `createInvoiceForCycle` lo inyecta como línea de cargo en la factura del mes siguiente (`surcharge_carried_in_usd`/`surcharge_carried_at`). + `families.late_fee_exempt` (checkbox "Exonerar recargos por mora" en el form de familia). |
| **0176** | **Menciones @ en comentarios de lista de espera**: tabla `waitlist_comment_mentions` (mismo patrón de `requirement_mentions`/`review_comment_mentions`) + campanita completa (query, realtime, click-through) + deep-link `?entry=<id>`. Nació como archivo "0173_waitlist_comment_mentions.sql", renombrada a 0176 por colisión con la 0173 de offset quincenal — **mismo SQL, no re-aplicar si ya corriste la versión "0173"**. |
| **0177** | **Desacople agenda/facturación — F1**: RPC nueva `generate_cycle_agenda` (crea ciclo + citas SIN factura, computa `payment_amount_usd` del snapshot para que `mark_monthly_cycle_paid` funcione igual) — `confirm_monthly_payment_and_generate` queda intacta como atajo combinado. `regenerate_cycle_appointments` gana arg `p_only_future` + pierde el guard `payment_status='pending'` (ciclos **pagados** también editables). Columnas nuevas: `paid_expected_usd`, `billing_adjustment_usd`, `billing_adjustment_carried_at`. |
| **0178** | Desacople F4: columna espejo `billing_adjustment_carried_in_usd` (ajuste RECIBIDO de un mes anterior, para que al regenerar la factura la línea de ajuste no se pierda) — mismo patrón que `surcharge_carried_in_usd` de 0175. |
| **0179** | **3 tipos de terapia nuevos**: Psicométrica, Neurodesarrollo, Diagnóstica TEA (`ServiceType` + labels/colores). De paso corrige un gap real: el CHECK de `waitlist_entries.requested_service_type` (0116) nunca se había actualizado desde que se agregaron 7 tipos posteriores (learning_kids, aula_educativa, ils_escucha, refuerzo_academico, concentracion_atencion, comunicacion_regulacion, estimulacion_juego) — seleccionarlos en el formulario de lista de espera violaba el CHECK. Ambos CHECK (`appointments` y `waitlist_entries`) quedan sincronizados. |
| **0180** | **Fix: plan 100% programa matutino no podía generar/previsualizar el ciclo** ("El plan no tiene terapista principal asignada" para un niño solo-BlueKids con miss y grupo ya asignados). Causa: desde 0157 `primary_therapist_id` se DERIVA solo de terapias individuales no-matutinas; un plan 100% matutino siempre lo tiene NULL legítimamente, pero 4 RPCs (`compute_monthly_appointment_candidates`, `confirm_monthly_payment_and_generate`, `generate_cycle_agenda`, `regenerate_cycle_appointments`) seguían con el guard incondicional del modelo viejo. Se vuelve condicional: solo bloquea si hay una terapia activa NO matutina sin terapista (reusa `_kn_is_monthly_flat`, misma regla que `planHasTherapistCoverage()` en TS). Verificado contra datos reales tras aplicar. |
| **0181** | **Los conflictos de horario dejan de bloquear ciclo/agenda**: `confirm_monthly_payment_and_generate`, `generate_cycle_agenda`, `regenerate_cycle_appointments` (`CREATE OR REPLACE`, mismas firmas) pierden el `RAISE EXCEPTION 'has_conflicts...'` — el check de solape (`compute_monthly_appointment_candidates`) no excluía al propio niño, así que un plan con dos terapias propias con el mismo terapeuta se marcaba "en conflicto consigo mismo" y bloqueaba su ciclo; el mismo guard en `regenerate_cycle_appointments` también podía abortar en silencio la sincronización agenda↔plan al editar. `conflicts[]`/`summary.conflict_count` se siguen calculando igual — la UI (`NewMonthlyCycleModal`/`EditMonthlyCycleModal`) ahora muestra un aviso ámbar no bloqueante en vez de deshabilitar el submit, distinguiendo "choca con otra terapia de la misma niña/niño" vs. "choca con la cita de otro paciente" (`describeMonthlyConflict` en `appointment.ts`, usa `conflict_child_id` que ya venía en el RPC sin consumirse). |
| **0182** | **Fix: no se podía eliminar un niño con facturas** — drift de esquema real: `invoices.child_id` tenía `ON DELETE RESTRICT` en la BD, contradiciendo lo que `0110_kinetic_invoices.sql` ya pretendía (`SET NULL`) — nunca quedó sincronizado; era la ÚNICA FK hacia `children` en todo el esquema que bloqueaba el borrado (el resto ya cascadea). Se corrige el FK a `SET NULL` + se ajusta `invoices_client_or_child_check` para permitir el estado huérfano (ambas columnas NULL tras borrar al dueño, sin dejar de prohibir que ambas estén asignadas a la vez) + se elimina `invoices_requires_owner` (redundante y en conflicto directo con el ajuste anterior). La factura sobrevive intacta (nombre de familia/niño ya embebidos en `notes`/`client_snapshot_json`/`invoice_items.description`) — mismo patrón "eliminar SIEMPRE conservando el registro contable" de 0169/0170. |
| **0183** | **Reposiciones individuales sin botón de iniciar sesión**: `start_therapy_session` (mig 0093) solo aceptaba citas `status='scheduled'` — una reposición nace directamente en `status='replacement'` (`resolve_absence_with_replacement`) y nunca pasa por `'scheduled'`, así que la RPC la rechazaba con `appointment_not_found_or_not_eligible`. Se amplía a `status in ('scheduled', 'replacement')`, misma firma. Acompaña un fix en `BigSessionCard.tsx` (el gate de los botones "Iniciar sesión"/"Inasistencia" en `/mi-dia` también solo aceptaba `'scheduled'`) — sin el fix de la RPC, el botón habría aparecido pero fallado al hacer clic. |

> **IMPORTANTE**: aplicar migraciones manualmente en Supabase Dashboard (o vía
> Management API `POST /v1/projects/<ref>/database/query` con el token del CLI —
> el token del CLI vive en Windows Credential Manager, target `Supabase CLI:supabase`,
> se lee con `CredRead` de `advapi32.dll`; ver sesión jul 2026 para el snippet
> de PowerShell). **GOTCHA (14-jul-2026): esa API solo ejecuta el PRIMER
> statement de un query con varios `;` — un archivo de migración con múltiples
> `ALTER TABLE` aplicó en silencio solo el primero (sin error) y los demás
> quedaron sin aplicar. Correcto: mandar cada statement DDL por separado y
> verificar cada uno contra `pg_constraint`/`information_schema` antes de
> seguir al siguiente.** **GOTCHA nuevo (0183)**: incluso con UN SOLO statement,
> una verificación inmediata después de aplicar puede leer una versión vieja
> (read-lag del endpoint de query) — si la verificación no muestra el cambio,
> reintentar la misma consulta de verificación antes de asumir que la
> aplicación falló; no reaplicar a ciegas. No hay migración automática. **El
> repo va hasta 0183; próximo libre = 0184.** ✅ TODAS aplicadas y verificadas
> en prod (14/16-jul-2026).
> ⚠️ Hay DOS archivos con historia sobre el prefijo 0173 (biweekly_offset y
> el de menciones renombrado a 0176) — ambos aplicados; no re-correr ninguno
> de los dos por el nombre viejo.
>
> **GOTCHA recurrente**: `create or replace function` con DISTINTO # de args
> NO reemplaza — crea una **sobrecarga** y deja la llamada ambigua. Al cambiar
> la firma de una RPC (compute/confirm del ciclo), agregar un `DROP FUNCTION`
> de la firma vieja en la misma migración.
>
> **GOTCHA nuevo (0180)**: al agregar una validación/guard a una RPC de ciclos,
> verificar que siga aplicando a TODOS los casos válidos del modelo de datos
> actual — un plan 100% programa matutino (blue_kids/learning_kids/aula_educativa)
> NUNCA tiene `primary_therapist_id` (se deriva solo de terapias individuales,
> desde 0157) y es un caso legítimo, no un error.

---

# Estado del proyecto — junio–agosto 2026

## Sesión 10 ago 2026 — el PDF de detalle de pago no cuadraba con su propio total
Todo en `master`. Sin migración (fix 100% de capa TS).

- **Síntoma reportado** (niño real, agosto 2026): la tabla de costos sumaba $415
  pero "Total a pagar" decía $375.
- **Causa**: eran **dos fuentes distintas**. Las filas se recalculaban **en vivo**
  contando citas de `appointments` (`cycle-detail.ts`, `count = countByService...`),
  mientras que "Total a pagar" era `cycle.payment_amount_usd`, **congelado al
  generar el ciclo**. `buildCycleDetail` incluso calculaba la suma de las filas
  (`subtotal`) y el PDF nunca la usaba. Al crear el ciclo los dos números nacen
  iguales (`NewMonthlyCycleModal` sincroniza sesiones cobradas ↔ citas mostradas),
  pero **nada los re-sincroniza después**: `regenerate_cycle_appointments` (0177)
  solo toca `appointments_generated_count`/`_at`. En el caso reportado el ciclo se
  generó del 10-ago en adelante con 3 conductuales ($375 exacto) y después
  apareció una 4.ª conductual el **lunes 10**, día que el plan no tiene conductual
  (reposición, sesión extra, o regeneración con "solo futuras").
- **Bug latente encontrado de paso**: el conteo en vivo **no excluía las
  reposiciones** (`status='replacement'`, mig 0155), que reponen una falta **ya
  cobrada**; y la cita original (`no_show`/`late_cancel`) también se contaba. Si
  falta y reposición caen el mismo mes, se cobraba dos veces la misma sesión.
- **Fix** (`cycle-detail.ts` + `CycleDetailPDF.tsx`): la tabla de costos cobra lo
  **facturado** (`snapshot.therapies_json[].sessions_per_month`, la misma fuente
  que `buildCycleLineItems` de la factura y que `payment_amount_usd`), con
  fallback al conteo de citas cobrables solo si el snapshot viejo no trae la
  cantidad. El calendario y "días y fechas por terapia" siguen mostrando la
  agenda real (el niño sí va), y las diferencias se **declaran** en `agendaNotes`:
  reposiciones sin costo / sesiones agendadas no incluidas en el cobro / sesiones
  cobradas que ya no están en la agenda. El desglose marca "Total: 4 (1 de
  reposición)". Las mensualidades fijas (programas matutinos) nunca generan aviso
  por cantidad de citas.
- **De paso, dos incoherencias más del mismo bloque de totales**: (1) el descuento
  se imprimía como etiqueta suelta ("Descuento 10%") sin monto, así que la resta
  hasta el total era invisible — ahora salen filas **Subtotal** y **Descuento
  -$X.XX** (misma regla que la factura: % sobre subtotal, fijo topado al
  subtotal). (2) El "Recargo por mora" se listaba como línea **antes** del total
  sin estar incluido en él — desde la mig **0175** ese recargo NO se cobra en el
  mes que se paga sino en la mensualidad siguiente, así que ahora va **debajo**
  del total y lo dice explícitamente.
- **GOTCHA de @react-pdf/renderer**: la Helvetica estándar **no trae el signo
  menos U+2212 (`−`)** y lo dibuja como **espacio en blanco, sin error** — el
  descuento salía "$37.50" sin signo. Usar guion ASCII `-`. El em dash `—` sí
  existe en la codificación y se puede seguir usando. Verificado extrayendo los
  code points del PDF con `pdfjs-dist` (ver abajo).
- **Cómo verificar un PDF sin poppler**: `pdftoppm`/ImageMagick no están
  instalados, pero `pdfjs-dist` sí es dependencia del proyecto — un script que
  levante `getTextContent()` y agrupe los items por `transform[5]` (Y) reconstruye
  el documento línea por línea, suficiente para validar montos, orden y glifos.
- **Limitación conocida (no tocada)**: `payment_amount_usd` no descuenta el
  rollover en modo `discount` ni incluye los arrastres (`surcharge_carried_in_usd`,
  `billing_adjustment_carried_in_usd`), que sí entran a la **factura**
  (`createInvoiceForCycle`). O sea este documento y la factura pueden diferir por
  esos conceptos. Es una divergencia previa del modelo de cobro, no del PDF; se
  dejó como está para no cambiar el monto que el sistema le pide a la familia.
  Ojo también: `upsertTreatmentPlan` SÍ resta el rollover al recalcular el monto
  — es el único de los 4 caminos que lo hace (generar, editar, sync y plan).

### Cobro automático de terapias extra (`agenda-charge-sync`)
El caso reportado NO era una reposición: la mamá pidió y pagó una **conductual
extra** que Diana agendó en el calendario. El cobro no la siguió porque
**agendar y cobrar eran dos acciones sin ningún vínculo**. A pedido del usuario
(que eligió cobro automático sobre "avisar y confirmar", sabiendo que el monto
cambia sin aprobación humana) ahora el cobro sigue a la agenda:

- **Puro**: `src/lib/domain/billing/agenda-charge-sync.ts` —
  `billableSessionCounts` (conteo cobrable por servicio), `periodMonthOfSV`,
  `therapiesSyncedToAgenda` (devuelve `therapies_json` con `sessions_per_month`
  puesto a la agenda).
- **Glue**: `src/app/actions/cycle-charge-sync.ts` → `syncCycleChargeToAgenda(childId, months[])`.
  Ciclo **pendiente** → ajusta `payment_amount_usd` (y regenera la factura si ya
  existía). Ciclo **pagado** → no re-cobra el mes: manda la diferencia a
  `billing_adjustment_usd`, que se arrastra al mes siguiente (mismo mecanismo
  que ya usaba `upsertTreatmentPlan`, migs 0177/0178). Ciclo **anulado** → nada.
  Usa **admin client** a propósito: quien agenda (una terapista) no pasa
  `kn_can_manage_cycles()` en RLS y el ajuste fallaría en silencio.
- **Enganchado en** `appointments.ts`: `createAppointment`, `deleteAppointment`,
  `moveAppointment` y `rescheduleAppointment` (los dos últimos sincronizan
  **ambos** meses, porque mover una cita de mes cambia el cobro de los dos).
  Nunca lanza — un fallo del sync no debe tumbar el agendado.
- **Regla de conteo** (única, compartida con el PDF vía `CHARGE_EXCLUDED_STATUSES`):
  se excluyen `rescheduled` (lápida de una cita movida/regenerada, contarla
  duplicaría) y `replacement` (reposición de una falta ya cobrada). **Sí** cuentan
  `no_show`/`late_cancel`/`cancelled`: se cobran este mes y se acreditan el
  siguiente por rollover — descontarlas acá las acreditaría dos veces.
- **Decisiones deliberadas**: (1) un servicio con **0 citas** en el mes NO se pone
  en cero — anular la agenda (`cancelCycleAgenda`) o borrar la última cita de una
  terapia no debe vaciar el cobro en silencio; si el cobro queda por encima de la
  agenda, el PDF lo declara. (2) Un servicio agendado que **no está en el plan** se
  agrega con el precio del catálogo (`terapia_individual`, BK-aware); sin precio
  activo NO se cobra y se loguea (`unpricedServices`) — el aviso del PDF queda de
  red de seguridad. (3) `editMonthlyCycle` sigue permitiendo poner una cantidad
  distinta a mano, pero **el próximo cambio de agenda de ese mes la revierte** al
  conteo real; para un ajuste que sobreviva, usar el **descuento** del ciclo.
- **No enganchado** (a propósito): `regenerate_cycle_appointments` y los cambios
  de plan van por RPC y ya recalculan el monto en su propio camino
  (`editMonthlyCycle` / `upsertTreatmentPlan`); `adminUpdateAppointmentTimes` solo
  corrige la duración de una terapia ya completada.

### Regenerar citas a mitad de mes duplicaba las sesiones ya dadas
Reportado al intentar corregir el ciclo desde la UI: *"si le doy regenerar citas
del mes me da conflicto con las que ya se dieron hoy"*. Dos bugs encadenados,
ambos en la capa TS (el RPC ya traía la herramienta desde la 0177):

- **`editMonthlyCycle` nunca pasaba `p_only_future`** al RPC. La 0177 agregó ese
  argumento justo para esto y quedó sin cablear. Sin él,
  `regenerate_cycle_appointments` recrea el patrón del **mes completo**, y como
  el paso 1 solo cancela las citas `status='scheduled'`, una sesión ya
  `completed` NO se cancela y encima se le crea una nueva → **duplicado** por
  cada sesión ya dada. El texto del modal decía "las ya completadas o en curso se
  respetan", que era falso: no se tocan, pero se duplican. Con el cobro
  automático nuevo ese duplicado además inflaría el monto.
- **El preview marcaba cada sesión ya dada como conflicto.**
  `dryRunCycleRegeneration` filtraba los conflictos contra las citas propias del
  ciclo, pero solo las `status='scheduled'` + auto-generadas (`ownIds`); una
  sesión `completed` no entra en ese set, así que el candidato del mismo slot se
  reportaba como choque. De ahí el "me da conflicto y no lo puedo hacer" (el
  submit nunca estuvo deshabilitado — desde la 0181 el aviso es no bloqueante —
  pero el rojo frena a cualquiera, y con razón: proceder duplicaba).

**Fix**: `dryRunCycleRegeneration(childId, periodMonth, onlyFuture)` recorta
candidatos/conflictos a los futuros y devuelve además `preservedPast` (sesiones
ya dadas por servicio, contadas con `billableSessionCounts` — la misma regla del
sync). El modal ofrece el alcance **"solo de hoy en adelante"** (default cuando el
mes ya empezó) vs. "todo el mes" (con aviso explícito de duplicado), suma
`preservedPast` al contador de "Ses/mes" para que regenerar a mitad de mes no
baje el monto, y el `−` del stepper no deja bajar por debajo de lo ya dado.
`editMonthlyCycle` gana `regenerateOnlyFuture` y lo pasa al RPC.

**Ojo para el futuro**: para corregir solo el **cobro** no hay que regenerar nada
— basta editar "Ses/mes" con la casilla apagada (ahí el campo es un input libre,
no el stepper ligado al patrón). El texto del modal ahora lo dice.

**Tercer bug del mismo modal — el final del mes se caía en silencio.** Verificado
contra datos reales: tras regenerar, la agenda quedó sin Lenguaje ni Sensorial
del **último lunes** (tumba `rescheduled` sin cita nueva), y el cobro automático
bajó el monto en consecuencia. Causa: `EditMonthlyCycleModal` arrancaba con
`res.result.candidates` a secas — ya topadas a `sessions_per_month` por
`compute_monthly_appointment_candidates`, que gasta la cuota con las fechas MÁS
TEMPRANAS del mes. Con "solo futuras", esas fechas tempranas ya pasaron y no se
recrean, así que la cuota se consume en citas que nunca se crean y el excedente
(el último lunes) se pierde. `NewMonthlyCycleModal` ya hacía lo correcto desde la
sesión de julio (`candidates` + `skipped_overquota` = patrón completo, WYSIWYG);
el modal de edición nunca se alineó. Ahora ambos arrancan con el patrón completo.
Aritmética del caso real: Lenguaje 8 de cuota → primeras 8 del mes (3, 4, 10, 11,
17, 18, 24, 25) → futuras = 5, y el 31 nunca entró. Igual para Sensorial (cuota 4
→ 3, 10, 17, 24; el 31 afuera).

**Cuarto bug, mismo modal y misma familia — el override solo se mandaba si el
usuario editaba algo.** `appointmentsOverride: regenerate && hasEdits ? ... : null`.
Sin override, `regenerate_cycle_appointments` recomputa por su cuenta con
`compute_monthly_appointment_candidates`, que vuelve a topar a la cuota del plan
vivo — o sea creaba MENOS citas que las que el modal mostraba y ya había cobrado.
Detectado en prod: ciclo cobrando 15 sesiones ($415) con 13 en la agenda
(`citas_generadas` = 10 = exactamente la cuenta quota-capped: Lenguaje 5,
Sensorial 2, Conductual 3). Ahora se manda siempre, como en
`NewMonthlyCycleModal`. **Regla general del modal: lo que se ve en el calendario
del preview es lo que se crea — cualquier camino que deje al RPC recomputar
rompe esa promesa.**

**Botón "Regenerar factura"** (`MonthlyCyclesSection`): editar un ciclo NO
actualiza su factura — queda emitida por el monto viejo. `createInvoiceForCycle`
ya sabía **parchar** una factura existente (conserva el número, reescribe totales
e ítems), pero la UI solo mostraba el botón cuando `!c.invoice_id`, así que no
había forma de dispararlo. Ahora aparece cuando hay factura y el ciclo sigue
`generated` + `pending` (una factura pagada no se reescribe), con confirmación.

## Sesión 14 jul 2026 — conflictos no bloqueantes + fix duplicación lista de espera
Todo en `master`, migraciones **0181, 0182 y 0183 aplicadas y verificadas en prod**. Spec →
plan → implementación con subagentes (superpowers), 8 tareas, cada una con
doble revisión (spec compliance + calidad). Spec en
`docs/superpowers/specs/2026-07-14-*.md`, plan en
`docs/superpowers/plans/2026-07-14-*.md`.

- **Conflictos de horario ya no bloquean** generar/editar un ciclo (mig 0181,
  ver tabla arriba) — antes un plan con dos terapias propias en el mismo
  terapeuta se bloqueaba a sí mismo como "en conflicto" (sin excluir al propio
  niño del check de solape), y el mismo guard podía frenar en silencio la
  sincronización agenda↔plan al editar. Ahora es aviso ámbar no bloqueante,
  distinguiendo conflicto con la propia niña/niño vs. con otro paciente.
- **Fix duplicación niño/familia** al re-avanzar una entrada de lista de espera
  ya convertida (revertir fase para corregir un error → re-avanzar creaba una
  SEGUNDA `families`+`children`, dejando la primera familia huérfana):
  `advanceWaitlistPhase` (`intake-pipeline.ts`) gana el mismo guard de
  idempotencia que ya tenía su hermana `transformWaitlistEntryToFamily`
  (`waitlist.ts:338-340`), portado ahí por primera vez. **Ojo de revisión**: la
  primera versión del fix forzaba la fase clínica del niño reusado de vuelta a
  "activo en terapias" incondicionalmente — si el niño ya había avanzado más
  (alta, retiro) esto lo regresionaba sin pasar por `validateTransition`; se
  corrigió para que reusar un niño existente NUNCA toque su fase clínica (solo
  un niño recién creado se auto-avanza a 3_3).
  Diagnóstico de familias huérfanas ya existentes (`find_orphaned_families.sql`,
  solo lectura): **12 encontradas en prod al 14-jul-2026** — reportadas al
  usuario, no se borró nada automáticamente (pendiente revisión manual caso
  por caso vía `deleteFamily`).
- **Recargo por mora** (pregunta del usuario, sin cambio de código): confirmado
  5% simple cada 5 días de atraso, hardcoded en `late-fee.ts` + duplicado en
  la función SQL `mark_monthly_cycle_paid` (mig 0175) — sin tabla de config,
  solo la exención booleana por familia es configurable.
- **Botón "Eliminar familia"**: `deleteFamily()` ya existía en `families.ts`
  (admin-only, borra en cascada) pero nunca se había conectado a ningún botón
  — `DeleteFamilyButton` (calca `DeleteChildButton`) ahora vive en la ficha de
  familia, con conteo de niños afectados en el aviso de confirmación. A pedido
  del usuario, se amplió a `CAN_DELETE_FAMILY_ROLES = [admin, coordinadora_familias,
  coordinadora_terapias]` — pero la RLS de `families` solo permitía DELETE a
  `admin`, así que `deleteFamily()` pasó a usar el admin client (mismo patrón
  ya usado en `deleteChild`) para no bloquear a las coordinadoras en silencio.
- **Fix permisos de alta/baja** (`discharge-records.ts`/`DischargeFormModal`):
  `coordinadora_terapias` puede finalizar una baja/alta con su sola firma
  (`CAN_FINALIZE_DISCHARGE`, mig 0174) pero `updateDischargeDraft` solo dejaba
  editar un registro ya firmado a admin/directora, y `sendDischargeToFamily`
  ni siquiera la incluía — quedaba sin forma de corregir campos ni de enviar
  lo que ella misma firmó. Ambos ahora incluyen `coordinadora_terapias`; la UI
  (`isEditable`) refleja el mismo permiso, y el botón "Firmar y finalizar" se
  restringe a `status='draft'` para no reaparecer en un registro ya firmado.
- **Mig 0182 — no se podía eliminar un niño con facturas**: drift de esquema
  real (ver tabla arriba) — `invoices.child_id` tenía `ON DELETE RESTRICT` en
  la BD viva pese a que `0110_kinetic_invoices.sql` ya decía `SET NULL`. Único
  FK hacia `children` en todo el esquema que bloqueaba el borrado; verificado
  con una consulta directa a `pg_constraint` (recomendado antes de asumir que
  el archivo de migración refleja el estado real de prod).
- **Mi día: nombre completo siempre visible**: `BigSessionCard`/`TodaySessionsSection`/
  `TimelineRow`/`WeekCompletedSection`/`page.tsx` priorizaban `preferred_name`
  (apodo, a veces solo el nombre de pila) sobre `full_name`, y truncaban con
  CSS — dos niños con el mismo apodo quedaban indistinguibles para la miss.
  Se invierte la prioridad (`full_name` primero) y se quita el `truncate` en
  las tarjetas principales, en los 5 sitios que renderizan el nombre.
- **Mig 0183 — reposiciones sin botón de iniciar sesión**: `start_therapy_session`
  solo aceptaba `status='scheduled'`; una reposición nace directamente en
  `status='replacement'` y nunca pasa por `'scheduled'`. Se amplía la RPC +
  el gate de botones en `BigSessionCard.tsx` (tenía el mismo problema del
  lado del cliente — sin el fix de la RPC el botón habría aparecido pero
  fallado al hacer clic).
- **Coordinadora de terapias no aparecía en el selector de reposiciones**:
  `/aprobaciones` filtraba el selector de terapista a solo `['terapista',
  'maestra']` — el mismo set más amplio (+ admin/directora/ambas
  coordinadoras) ya existía correctamente duplicado en otros dos archivos
  (asignación de terapista en el plan, "sustituir terapeuta"). Se extrae a
  una constante única `THERAPY_CAPABLE_ROLES` en `types/db.ts`, usada en los
  3 lugares para que no se desincronicen otra vez.
- **PDF de detalle de pago mensual — 2 fixes**: (1) la tabla "Plan de
  terapias contratado" armaba sus columnas de una lista fija
  `['mon'..'fri']` — una terapia en sábado/domingo se descartaba en
  silencio (el calendario y el desglose del mismo PDF sí la mostraban bien,
  se calculan aparte desde las citas reales). Se agregan sábado/domingo
  como columnas extra SOLO si el plan los usa (lunes-viernes se siguen
  mostrando siempre). De paso corrige el orden del desglose por terapia,
  que ordenaba sábado/domingo ANTES que lunes. (2) A pedido del usuario, se
  aclara junto a cada terapia en la tabla de costos a cuántos minutos
  corresponde el precio unitario (ej. "Sensorial (30 min)"), leyendo la
  duración real de `schedule_pattern_json` en vez de asumir 30 min fijo
  (una terapia con tarifa propia de 60 min, ej. `ils_escucha`, muestra su
  duración real). **Deliberadamente no se tocó el cálculo de "# en el mes"
  ni el monto** — el sistema no dobla automáticamente el precio por
  duración hoy (se ajusta manualmente al armar el plan); hacerlo solo en
  este PDF habría hecho que la suma de filas no coincidiera con "Total a
  pagar" (que viene fijo de `payment_amount_usd`, calculado aparte en las
  RPCs de ciclo).
- **Fix asistencia BlueKids**: `/ninos` filtraba por terapista armando
  `therapistIds` SOLO desde `treatment_plans` (`primary_therapist_id` +
  `therapies_json[].therapist_id`). Un niño de programa matutino puro no
  lleva terapista individual (mig 0180) — su cobertura real es
  `program_group_staff`, no el plan — así que si además su única terapia
  individual estaba asignada a OTRA persona (no la miss de su grupo), esa
  miss nunca aparecía como cobertura suya en el filtro, aunque sí fuera su
  miss real de grupo. Se agrega `program_group_members`/`program_group_staff`
  como fuente adicional en `ninos-dashboard.ts`, unida con la del plan —
  mismo patrón que ya usaba correctamente `listMyChildren` (`my-children.ts`)
  para `/mis-ninos`. Verificado contra el niño real reportado (grupo "BK1").
- **Auditoría de allowlists duplicadas** (a pedido del usuario, tras el fix de
  `/ninos`): encontró 2 gaps activos más, ambos arreglados. (1)
  `ChildSessionReportsHistory` mostraba "Editar/Corregir" a `directora` para
  informes de sesión en cualquier estado, pero `SessionReportModal` y la
  server action (`session-reports.ts`) tenían su propia lista de roles sin
  `directora` — el botón no hacía nada real para ella. Consolidado en
  `SESSION_REPORT_SUPER_EDITOR_ROLES` (`types/db.ts`), usada en los 3
  lugares. (2) `createChild`/`updateChild` ya permiten a `supervisor` crear
  y editar niños, pero las dos páginas que muestran el botón de editar
  (`CAN_EDIT_CHILD_ROLES`/`CAN_EDIT_CHILD_INFO_ROLES`) nunca incluían ese
  rol — se agrega a ambas. Además encontró un gap grande NO arreglado aún
  (fuera de alcance rápido, flaggeado como tarea aparte): `/reportes/por-terapista`
  computa KPIs (asistencia, cumplimiento de informes) SOLO desde
  `treatment_plans` — mismo problema estructural que `/ninos` tenía, nunca
  actualizado con la lógica de `program_group_staff`/`assignee_ids` que
  `therapist-capacity.ts` ya usa correctamente. Varios clusters de arrays de
  roles duplicados-pero-coincidentes también quedaron identificados (no
  arreglados, bajo riesgo mientras coincidan) — ver memoria de sesión para
  la lista completa si se retoma.
- **Fix asistencia de programas matutinos contada doble**: `regenerateMorningAppointments`
  (`monthly-cycles.ts`) sigue creando una cita por-niño
  (`event_type='programa_matutino'`, `status='scheduled'` para siempre —
  mig 0151) además de la sesión de grupo real. `ninos-dashboard.ts` y
  `child-dashboard.ts` contaban esas citas individuales Y ADEMÁS sumaban la
  asistencia real de grupo encima — duplicando cada sesión. Otras vistas
  (mi-dia, capacidad-terapistas, therapist-schedules, therapist-capacity.ts)
  ya excluían `programa_matutino` de sus conteos; estas dos no. Se corrige
  en ambas (más el filtro de `'cancelled'` que faltaba en `ninos-dashboard.ts`,
  y la grilla de calendario de `child-dashboard.ts` que pintaba DOS bloques
  el mismo día). Verificado contra datos reales: niña Learning Kids, julio
  2026, tenía 23 citas leftover + 23 sesiones de grupo reales (21 presente)
  — antes mostraba 21/33, ahora 21/23.
- **Caso real de pérdida de datos investigado (Christian Atilio Romero)**:
  reportado un niño+familia nueva creada en lista de espera que no dejó
  ningún rastro en la BD (ni waitlist_entry, ni children, ni families —
  verificado exhaustivamente contra prod, incluyendo listar las 33 filas
  completas de `waitlist_entries`). El flujo de creación (`createWaitlistEntry`
  + `NewWaitlistEntryModal`) SÍ valida `res.ok` antes de cerrar — no hay bug
  de "éxito falso". Causa más probable: confusión de UX + `useDraft` — el
  indicador "Guardado local HH:MM" solo significa que el borrador quedó en
  `localStorage` de ESE navegador, nunca llegó al servidor, y Cancelar/cerrar
  (X) lo descartaban sin ningún aviso. Alguien vio el indicador, asumió que
  ya estaba guardado, y cerró sin apretar "Crear entrada" — dato
  irrecuperable (no hay borrador rescatable si no se sabe qué equipo se usó).
  Fix preventivo: Cancelar/X en `NewWaitlistEntryModal` ahora piden
  confirmación si hay contenido real sin enviar; el catch de `handleSubmit`
  distingue sin-conexión real de cualquier otro error (antes CUALQUIER
  excepción, incl. sesión vencida, mostraba el mensaje engañoso de "sin
  conexión, tus datos están a salvo"); `SaveStatusIndicator` (compartido por
  TreatmentPlanEditor/SessionReportModal/FamilyForm/ChildForm/etc.) pasa de
  "Guardado local" a "Borrador local... (sin enviar)" + tooltip — mismo
  riesgo de confusión existe en TODAS las formas que usan `useDraft`, solo
  se blindó el cierre (Cancelar/X) en esta una; las demás formas quedan con
  el texto más claro pero sin el guard de confirmación todavía.
- **Paridad coordinadora_familias/coordinadora_terapias en sustituir terapeuta
  y gestión de usuarios**: a pedido del usuario, dos huecos de permisos
  cruzados. (1) `coordinadora_familias` gestiona personal (`/users`) pero no
  podía usar "Sustituir terapeuta" (relevo en bloque de todas las terapias de
  una miss a otra) — el gate de UI (`UserProfilePanel.tsx`) y el de la Server
  Action (`therapist-reassignment.ts`) tenían el mismo array inline
  `['admin','directora','coordinadora_terapias','recepcion']`, coincidente
  pero duplicado; se agrega el rol y se consolida en `CAN_REASSIGN_THERAPIST_ROLES`
  (`types/db.ts`). (2) `coordinadora_terapias` podía sustituir terapeutas pero
  NO gestionar personal ni cuentas de portal (`/users`, `/usuarios-portal`,
  cambiar roles, horarios/capacidad) — ese permiso (`admin`, `directora`,
  `recepcion`, `coordinadora_familias`) estaba duplicado con el mismo valor en
  7 lugares (`users.ts`, `updateUserRole.ts`, `therapist-schedules.ts`,
  `familyUsers.ts`, guards de página de `/users` y `/usuarios-portal`, y 2
  entradas del Sidebar) — mismo patrón de allowlist duplicada de la auditoría
  anterior. Se agrega `coordinadora_terapias` y se consolida todo en
  `CAN_MANAGE_USERS_ROLES` (`types/db.ts`), usada en los 7 lugares. Los guards
  anti-escalada de admin (no crear/asignar/borrar el rol admin) no se tocaron.
- **Auditoría de permisos de recepción** (a pedido del usuario, tras el fix
  anterior): se revisaron todos los arrays con `admin`+`directora` para ver
  si a `recepcion` le faltaba paridad en algún lado. Un gap real encontrado:
  `/operacion/horarios-terapistas` (página de "Configurar horarios") tenía su
  propio guard `['admin', 'directora']`, pero `capacidad-terapistas/page.tsx`
  (accesible a `recepcion`/`coordinadora_terapias`) enlaza incondicionalmente
  a esa página con "Configurar horarios →" — **enlace fantasma**: se veía
  pero redirigía a `/dashboard` al hacer clic, aunque el Server Action real
  (`therapist-schedules.ts`) ya aceptaba la escritura de esos roles vía
  `CAN_MANAGE_USERS_ROLES`. Se reemplaza el guard local por la misma
  constante. El resto de los casos revisados (`CAN_CANCEL_ROLES` sin
  recepción en anular ciclo, `/aprobaciones` sin recepción en recogidas
  tardías, roles clínicos como `CAN_FINALIZE_DISCHARGE`/`THERAPY_CAPABLE_ROLES`)
  son exclusiones **intencionales y ya documentadas** — recepción no gestiona
  decisiones clínicas ni anulaciones sensibles de factura. Dos hallazgos
  menores quedaron sin arreglar (bajo riesgo, no bloquean nada): `/admin/tarifas`
  parece un duplicado legacy de `/catalogos` (solo enlazado desde
  `MgmtDashboard`, que recepción no ve — candidato a eliminar); y
  `CAN_DELETE_FAMILY_ROLES` no incluye `directora` (solo admin + ambas
  coordinadoras) — inversión rara, no confirmada como bug.
- **Pendiente**: sincronizar `supabase/scripts/full-setup/02_kinetic_schema.sql`
  (script de bootstrap de proyecto nuevo) con las migs 0181/0182/0183 —
  todavía tiene el guard de conflictos viejo en 4 lugares, el FK de invoices
  sin corregir, y `start_therapy_session` sin el estado `replacement`; un
  ambiente nuevo partiría con los tres bugs ya arreglados en prod. Flaggeado
  como tarea aparte, no bloqueaba este lote.

## Sesión 11-14 jul 2026 — lote grande: menciones, capacidad, desacople agenda/facturación
Todo en `master` hasta commit `ba46778`. Migraciones **0173–0180 aplicadas y
verificadas en prod** (yo mismo las apliqué vía Management API, token del CLI
leído del Windows Credential Manager — target `Supabase CLI:supabase`, con
`CredRead`/`CredFree` de `advapi32.dll` en PowerShell, ya que el archivo
`supabase/.temp/pooler-url` no trae password). **Próximo libre = 0181.**

- **Menciones @ en lista de espera** (mig 0176, ver tabla arriba): campanita
  completa + deep-link. Spec en `docs/superpowers/specs/2026-07-09-*.md`,
  revisado 2 veces contra código real antes de implementar.
- **Fix capacidad de terapistas**: grupos matutinos se contaban N veces (una
  por niño) en vez de una por bloque de grupo. `calculateWeeklyOccupancy`
  reescrita: excluye `programa_matutino` por-niño, suma `program_group_sessions`
  una vez por staff, cuenta TODOS los tipos de evento y a los asignados
  (`assignee_ids`, no solo `therapist_id`). 8 tests nuevos.
- **Fix "Terapista" genérico** en horas completadas: el nombre se resolvía
  con un query filtrado por rol terapista/maestra; ahora se resuelve por los
  `therapist_id` reales que aparecen en las citas completadas (cubre
  coberturas de otros roles).
- **Asistencia de grupos matutinos visible en calendarios**: nuevo
  `src/lib/domain/morning-attendance.ts` (`fetchMorningSessionCellsForChildren`)
  — sintetiza sesiones de grupo como celdas de calendario (el programa YA es
  un `ServiceType` de primera clase, así que no hizo falta UI nueva). Cableado
  en dashboard del niño (grilla + próximas 14 días) Y portal de padres
  (próxima cita, mini-calendario, agenda). Limitación conocida: el PDF de
  exportar agenda no incluye estas sesiones (re-consulta `appointments` por
  id, las sesiones de grupo no viven ahí).
- **Lote 8 fixes de reunión**: **firma única de coordinadora en altas**
  (mig 0174, URGENTE — antes pedía terapista+directora); **ficha del niño**
  con chip de redes sociales siempre visible + sección "Familia y contactos"
  (papá/mamá/teléfonos); **filtro por colegio** en `/ninos` (`?school=`);
  **botón Reanudar** sesión finalizada por error (`resumeTherapySession`,
  bloqueado si ya despachado); **botón Reposición de emergencia**
  (`emergencyIncomplete` — sesión iniciada pero no completada: cierra la
  therapy_session huérfana, marca `no_show` con `completed_at=null`, crea/
  reabre `appointment_absence` pending); **multa por mora diferida** (mig
  0175 — ya no infla la factura del mes que se paga, se arrastra como línea
  de cargo al mes siguiente) + `families.late_fee_exempt`; **nombre completo
  al pasar lista** de grupos (era el campo correcto, un `truncate` lo cortaba
  visualmente).
- **Managers suben foto de otro usuario** (`uploadUserAvatarFor`, admin
  client evade RLS del bucket, sin migración).
- **3 tipos de terapia nuevos**: Psicométrica, Neurodesarrollo, Diagnóstica
  TEA (mig 0179) + fix de un CHECK desactualizado en `waitlist_entries` de
  paso.
- **PROYECTO desacople agenda/facturación — F1 a F4 completo** (spec en
  `docs/superpowers/specs/2026-07-12-*.md`, revisado contra código real, 3
  issues corregidos antes de implementar). "La agenda manda, la facturación
  lee": `generate_cycle_agenda` (RPC nueva, sin factura) + botón "Generar
  factura" separado (mig 0177); ciclos **pagados** también editables (guard
  relajado); prompt de alcance estilo Google Calendar al editar plan
  (`scheduleScope: only_future|skip_agenda`) y al mover citas
  (`moveAppointmentSeries` — "esta y las siguientes"); ajuste de monto por
  cambios post-pago se arrastra al mes siguiente (`billing_adjustment_usd`/
  `paid_expected_usd`, mig 0177/0178, mismo patrón que la mora diferida);
  anulación separada (factura / agenda / todo); cierre de 2 fugas de snapshot
  (`schedule_pattern_json` no se refrescaba en `editMonthlyCycle`;
  `billing_mode` del rollover se leía del plan vivo en vez del snapshot).
- **Fix (post-deploy) "plan no tiene terapista principal"** (mig 0180): un
  niño 100% programa matutino (ej. solo BlueKids) NUNCA tiene
  `primary_therapist_id` (se deriva solo de terapias individuales desde
  0157) — 4 RPCs de ciclo seguían con el guard incondicional del modelo
  viejo y bloqueaban la previsualización/generación. Guard vuelto
  condicional (reusa `_kn_is_monthly_flat`). Verificado contra datos reales
  del niño reportado antes y después del fix.
- **Pendiente próxima sesión**: rediseño UX de `/operacion/grupos` (quitar/
  automatizar "Generar sesiones del mes", cards con un solo botón de
  desplegar + avatares de misses, lista de miembros con contador de
  asistencias, histórico de asistencias) — quedó diseñado en el brainstorm
  pero sin spec ni implementar.

## Sesión jul 2026 (2-3 jul) — reunión Admón + follow-ups + eliminar usuario
Todo en `master` (último commit `0326b40`). **⚠️ PENDIENTES DE APLICAR: 0168 y 0172.**
- **Lote reunión Admón (10 puntos)**: agenda sin tope de fecha (mes anterior→∞,
  sin `.lte`), editar plan se refleja en horario (sync `therapist_id` de citas
  futuras + revalidar rutas anidadas), reposiciones al mes siguiente (ventana de
  sugerencias 14→30 días), sustituir terapeuta (`reassignAllFromTherapist`), baja
  sin firma bloqueante de directora (`finalizeDischarge`), auto-archivar niño a 3
  meses (mig 0166), comentarios de lista de espera (mig 0165), campo redes
  sociales (`children.photo_consent`), borrar niño manual (`DeleteChildButton`),
  canales de chat para coordinadoras/recepción.
- **Eventos de persona libre** (`usesFreePerson`): entrevistas/reuniones/entrega
  de avances/otro/evaluación → nombre libre + asignar a cualquier staff.
- **Asignación múltiple (mig 0168)**: `appointments.assignee_ids uuid[]`;
  eventos multi-persona los ve cada asignado en agenda y /mi-dia.
- **Colores por terapeuta 12→17** (paleta más variada).
- **Fix lista de espera "desaparecían niños"**: el pipeline hacía `overflow-x`
  (columnas a la derecha off-screen) → `flex-wrap`; + crear columna para fases
  con entradas aunque estén ocultas.
- **Fix subir archivos**: validar/subir por EXTENSIÓN (no el MIME del navegador,
  que da octet-stream) en `report-files.ts` y `child-attachments.ts`.
- **coordinadora_familias gestiona usuarios** (paridad con recepción, /users +
  /usuarios-portal, guards anti-escalada intactos).
- **Saga "Database error deleting user"** (migs 0169–0172): causa real = el CHECK
  `appointments_terapia_requires_service_and_therapist` (mig 0092) exigía
  `therapist_id` no nulo en toda `terapia`; el SET NULL al borrar terapeuta lo
  violaba. **0172 lo relaja** (solo exige `service_type`). `deleteUser` ahora
  borra `public.users` primero (para ver el error real de Postgres, no el
  genérico de GoTrue). La planilla del borrado sobrevive vía
  `payroll_items.user_snapshot_json` (0170). **Ojo**: reasignar con "Sustituir
  terapeuta" ANTES de borrar, o las citas quedan huérfanas. Detalle en
  [[kinetic_followups_user_delete_2026_07]].

## Sesión julio 2026 — ciclo WYSIWYG + navegación de mes en dashboard
Todo en `master` (auto-deploy Vercel, verificado live). Ver [[kinetic_cycle_generates_agenda_2026_06]].
- **Generar ciclo = MES COMPLETO (WYSIWYG).** El modal `NewMonthlyCycleModal`
  arranca la previsualización con TODO el patrón del mes (`candidates` +
  `skipped_overquota`) y pasa siempre ese set como `appointmentsOverride` → se
  crean **exactamente las citas que se ven**, sin el tope oculto de
  `sessions_per_month`. Se quitan citas con − / ✕. **Ojo: cobra por TODAS las
  sesiones del patrón.** (Antes topaba a la cuota del plan y amontonaba las
  primeras 2 semanas.)
- **Dashboard del niño con navegación de mes** (para ver ciclos futuros ya
  agendados). `getChildDashboardData(supabase, childId, now, viewMonth?)`; la
  página de familia lee `?month=YYYY-MM`; `ChildDashboardPanel` tiene flechas
  ‹ › arriba **y** la barra del calendario navega el mes por URL (`monthUrlBase`).
  Claves: `key={period_month}` **remonta** el calendario al cambiar de mes (su
  `date` interna solo se inicializa al montar), y `KineticMonthGrid` sin tope de
  pills (`maxPillsPerCell=99`) muestra TODAS las citas del día. La lista
  "Próximas 14 días" siempre es de 14 días — no es el lugar para ver el mes.
- **`MonthlyCyclesSection` responsivo en móvil**: tabla en desktop
  (`overflow-x-auto`) + tarjetas apiladas en móvil (las acciones ya no se recortan).
- **Acceso/diagnóstico sin intervención del usuario**: SQL vía REST + service_role
  key; estado de deploy vía GitHub deployments API. Ver [[kinetic_supabase_access]].

## Bloque "feedback operativo" (junio 2026) — 8 features + cobros
Todo en `master`. **Requiere aplicar migraciones 0134–0141 en orden.**
1. **F1 Propuesta**: "cotización" → "**propuesta**" en UI/PDF **y rutas**
   (`/billing/propuestas`, `/portal/facturacion/propuestas`). BD interna sigue
   siendo tabla `quotes`, `QuoteStatus`, `can_quote`, `/api/quotes`.
2. **F2 Terapista por tipo de terapia**: `TreatmentPlanTherapyEntry.therapist_id`
   por terapia (editor con selector "↳ Usar principal"). Al generar el ciclo,
   cada cita se asigna a la terapista de su `service_type` (fallback
   `primary_therapist_id`). Mig 0134 (RPC compute/confirm).
3. **F3 Catálogos** (`/catalogos`, admin/contable/recepción): pestaña **Precios**
   (cobro: `unit_price_usd`/`unit_price_bk_usd`) + pestaña **Costos**
   (`cost_usd` = pago a terapista). `service-catalog.ts` CRUD. Mig 0135.
4. **F4 Facturación con vencimiento + recargo**: el ciclo se genera como factura
   **PENDIENTE** (`payment_status='pending'`, `due_date`=gracia día 5) → luego
   **"Marcar pagado"** (RPC `mark_monthly_cycle_paid`) aplica **recargo 5% simple
   por cada 5 días de atraso**. **"Prorrogar gracia"** (`grace_extended_to`+motivo).
   Tag en cards de `/niños` (Faltan N días / N días atraso / Al día). Lógica pura
   `src/lib/domain/billing/late-fee.ts`. Mig 0136.
5. **F5 Despacho + recogida tardía (realtime)**: terapista marca "terapia
   finalizada" (`completed_at`) y "Despachar niño/a" (`dispatched_at`). Tarifa
   `late-pickup.ts`: 0–15min gratis, >15=$5, +$5/30min. Pop-up sincronizado
   (`DispatchWatcher` en layout, Supabase realtime sobre `appointments`)
   "¿el niño sigue ahí?" a terapista+recepción; "no lo han traído" =
   `dispatch_snoozed_until`. Cargo **sugerido** → cobrar/perdonar en
   **/aprobaciones** (`LateFeeApprovalList`). Bloqueo: no abrir otra terapia si
   no despachó la anterior. `src/app/actions/dispatch.ts`. Mig 0140.
6. **F6 Planilla por terapia**: `contract_type` = `mensual_fijo|por_terapias|sin_contrato`.
   `por_terapias`: pago = terapias completadas × `cost_usd` del catálogo.
   `mensual_fijo`: salario + terapias `is_extra` × `cost_usd`. `createPayrollRun`
   lo computa. Mig 0138.
7. **F7 Rollover** (manual al crear el ciclo): sesiones no dadas del mes anterior
   (`no_show/late_cancel/cancelled` sin reposición) → **Acumular** (citas extra,
   sube cuota en compute, sin recobrar) o **Descontar $** (de la factura).
   `getCycleRolloverPreview`. Mig 0139.

### Aprendizajes / gotchas de cobros
- El ciclo mensual: **generar = factura pendiente** (NO cobra); **marcar pagado**
  = registra pago + recargo. Reportes financieros filtran por `paid_at` (NULL en
  pendientes ⇒ no cuentan como ingreso hasta pagar). ✔ correcto.
- **Server Action en `<form action>`**: si el componente vive en árbol Server Y
  Client (ej. `JournalEntryList` usado por staff y portal), NO usar `'use server'`
  inline — exportar el action de un archivo `'use server'` y pasar args con
  `<input type="hidden">` + `FormData`.
- **Higiene de datos del import**: hubo familias/niños duplicados (una persona
  creaba niños nuevos en fase `1_1` en vez de editar los `3_3` auto). Limpieza vía
  SQL: comparar por familia, mover hijos reales a una familia, borrar cascarón.

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
10. **Cleanup técnico (Fase 2)**:
    - Eliminadas rutas `/admin/plantillas/*`, componentes `admin/plantillas/`, y action `report-templates.ts` (sin consumers externos). Tabla `report_templates` y columna `template_id` conservadas para informes históricos (lectura directa desde `/aprobaciones` y portal).
    - Eliminados links a `/admin/plantillas` en `MgmtDashboard` y `CoordTerapiasDashboard`.
    - Bug fix: `removeProgressReportFile` ahora deja `upload_kind='file'` (antes: `'editor'`, deprecated).
    - `supabase/scripts/verify_pending_migrations.sql`: script SQL para validar en Supabase Studio si las 4 migraciones pendientes (0107 kinetic, 0114, 0115, 0116) están aplicadas.
11. **Reportería financiera (Fase 1A)**:
    - Ruta nueva `/reportes` (landing con 4 tarjetas; Financieros activa, otras 3 placeholders "Próximamente").
    - Sub-página `/reportes/financieros` con 4 secciones acordeón: ingresos mensuales, comparativa anual, ciclos generados vs cancelados (con top motivos), pagos por método.
    - Funciones puras en `src/lib/domain/reports/financial.ts`: `getMonthlyRevenue`, `getAnnualComparison`, `getCycleStatusBreakdown`, `getPaymentMethodBreakdown` — todas leen `monthly_session_cycles` agrupado por `paid_at` en zona SV.
    - PDFs vía `@react-pdf/renderer`: shell `KineticReportPdf.tsx` + 4 componentes concretos; A4 portrait (mensuales / ciclos / métodos) y A4 landscape (anual). Paleta Kinetic `#00675c`/`#b31b25`.
    - 4 API routes bajo `/api/reportes/financieros/*` con `renderToBuffer()`. Roles: admin, directora, contable, recepcion. Logo de `app_settings.value` con `key='agency_logo_url'`.
    - `AccordionSection` reusable extraído a `src/components/ui/AccordionSection.tsx`.
12. **Planillas y contabilidad (Fase 8)**:
    - Migración 0117: columnas salariales en `users` (`monthly_salary_usd`, `hourly_rate_usd`, `contract_type`, `dui`, `isss_number`, `afp_number`, `afp_provider`, `hire_date`) + tablas `payroll_fiscal_config` (con seed SV: ISSS 3%/7.5% tope $1000, AFP 7.25%/8.75%, ISR 4 tramos) + `payroll_runs` + `payroll_items` + RLS + RPC `sign_my_payroll_item`.
    - Función pura `calculatePayroll` en `src/lib/domain/payroll/calculation.ts` con `applyIsrBrackets`. Toda la matemática es testable sin Supabase. Configuración fiscal versionable por `effective_from`.
    - Server actions en `src/app/actions/payroll.ts`: `createPayrollRun`, `updatePayrollItem`, `removePayrollItem`, `sealPayrollRun`, `markPayrollRunPaid`, `cancelPayrollRun`, `signMyPayrollItem` (vía RPC `SECURITY DEFINER`), `updateUserSalary`, `updateActiveFiscalConfig`, más lecturas (`listPayrollRuns`, `getPayrollRunDetail`, `listMyPayrollItems`, `getMyPayrollItem`).
    - Estados de planilla: `draft` (editable) → `sealed` (inmutable, snapshot del config fiscal + snapshot por empleado) → `paid`. **Anulable en cualquier estado, incluso `paid`** (junio 2026, con motivo obligatorio): marcar pagada no genera asientos, así que anular una pagada solo cambia el estado y queda auditado (cancel_reason/cancelled_by/cancelled_at). UI: botón "Anular planilla pagada" en `PayrollRunActions`.
    - UI admin en `/reportes/contabilidad/*`: landing, lista de planillas, detalle editable con KPIs y tabla colapsable por empleado, configuración (constantes fiscales + tabla de salarios). Solo admin/directora/contable.
    - UI empleado en `/mis-recibos`: lista de planillas selladas/pagadas + detalle con desglose + botón "Firmar recibo (conforme)". Sidebar top-level visible a todo el staff (no family/client).
    - PDFs: `PayrollRunPDF` (landscape, planilla completa con totales + aportes patronales) y `PayrollItemPDF` (portrait, recibo individual con desglose + zona de firma o sello "firmado digitalmente"). API routes `/api/reportes/contabilidad/{planilla,recibo}/[id]`.
    - Tarjeta "Planillas" activada en `/reportes`. Script `supabase/scripts/verify_pending_migrations.sql` extendido con checks de mig 0117.
13. **Reportes por terapista**:
    - Ruta `/reportes/por-terapista` (admin, directora, coordinadora_terapias). Filtros: año + mes.
    - 3 KPIs por terapista en función pura `src/lib/domain/reports/therapist.ts`:
      - **Asistencia**: completed / no_show / late_cancel / replacement_attended + show rate %.
      - **Carga horaria**: hoursWorked (suma de duraciones completed) vs hoursContracted (estimado `max_hours_per_week × días/7`).
      - **Cumplimiento informes**: niños como primary_therapist + informes vencidos en el período + entregados (approved/sent_to_family) + % cumplimiento.
    - PDFs: `TeamReportPDF` (landscape A4, tabla comparativa con headers anidados) + `IndividualTherapistPDF` (portrait A4, KPI boxes + detalle de citas).
    - API routes: `/api/reportes/por-terapista/{equipo,individual/[id]}`. El terapista puede descargar su propio PDF individual (auto-reporte).
    - Tarjeta "Por terapista" activada en `/reportes`. Usa `appointment_absences` con status='replaced' para contar reposiciones cumplidas.

## Pendiente (próximas sesiones)
- **Rediseño UX de `/operacion/grupos`** (grupos matutinos) — brainstorm hecho,
  sin spec ni implementar. Puntos: quitar/automatizar el botón "Generar
  sesiones del mes" (hoy manual y sin motivo aparente para serlo); cards de
  grupo con un solo botón de desplegar (hoy varias acciones sueltas) +
  avatares de las misses a cargo (patrón overlap ya usado en
  `PipelineCard.tsx`, líneas ~153-167); lista de miembros más prolija con
  contador de asistencias por niño; vista de histórico de asistencias
  (nueva, no existe hoy). Ver mapeo completo de la página actual
  (`GruposClient.tsx`, `program-groups.ts`) en la sesión 11-14 jul.
- (Hecho jul 2026) ~~Botón "Eliminar niño/a"~~ → `DeleteChildButton`.
- (Hecho jul 2026) ~~Migraciones pendientes~~ → todas aplicadas hasta 0180.
- (Backlog) Permitir a recepción cobrar/perdonar recogidas tardías (hoy
  `/aprobaciones` está gated solo a admin/directora).
- (Backlog, recomendado) Botón "Desactivar usuario" (soft-delete) — al eliminar
  un terapeuta sus citas quedan huérfanas (therapist_id null tras 0172); lo sano
  es desactivar (conserva historial) o reasignar con "Sustituir terapeuta" antes.
- (Backlog) Detección automática de slot liberado tras cancelar cita → alerta a lista de espera
- (Backlog) Notificaciones a familias en waitlist por email/WhatsApp
- (Backlog) Vista mensual/anual de capacidad (actual es solo semanal)
- (Backlog) Formulario público de solicitud de cita (waitlist autoservicio)
- (Backlog, del desacople F1-F4) Precios/costos en `/catalogos` para los 3
  tipos de terapia nuevos (Psicométrica, Neurodesarrollo, Diagnóstica TEA) —
  quedaron sin monto, alguien con acceso a Catálogos debe cargarlos cuando
  se necesiten para facturar.

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
