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
- `/users` — Equipo unificado con panel lateral (tabs Perfil / Horario / Capacidad)
- `/usuarios-portal` — Cuentas family
- `/operacion/capacidad-terapistas` — Tabla semanal comparativa de ocupación (admin/directora/coord_terapias/recepción)
- `/catalogos` — **Catálogos de precios (cobro) y costos (pago terapista)** editables (admin/contable/recepción). Mig 0135.
- `/reportes` — Landing de reportería Kinetic (admin, directora, contable, recepcion, coordinadora_terapias). Tarjetas activas: **Ingresos**, **Egresos**, **Planillas** y **Por terapista**.
  - `/reportes/financieros` — Sección de **Ingresos** (en UI). 5 reportes web+PDF: ingresos mensuales, comparativa anual, ciclos, pagos por método, **churn de familias** (altas, alta médica, bajas, pausas, neto). La ruta sigue siendo `/financieros` por compatibilidad.
  - `/reportes/egresos` — Egresos del centro: total mensual, desglose por mes (planilla auto + gastos generales), distribución por categoría, CRUD de gastos generales (renta, luz, agua, transporte, etc.). Roles: admin, directora, contable.
  - `/reportes/contabilidad` — Hub de Planillas → listado mensual + configuración. (La ruta sigue siendo `contabilidad` para minimizar churn; en UI se muestra como "Planillas".)
  - `/reportes/contabilidad/planillas` — Listado y creación de planillas mensuales. Cada mes admite **dos planillas separadas** por `payroll_type`: **normal** (sueldo fijo, ISSS/AFP/ISR + aportes patronales) y **servicios profesionales** (honorarios, solo retención ISR configurable, sin ISSS/AFP). El modal de creación elige el tipo.
  - `/reportes/contabilidad/planillas/[id]` — Detalle: editable en draft, sellado inmutable, firma de empleados, PDF. La UI/PDF de servicios profesionales ocultan ISSS/AFP/patrono y muestran solo honorarios → retención → neto.
  - `/reportes/contabilidad/configuracion` — Constantes ISSS/AFP/ISR + **% retención servicios profesionales** (admin) + tabla de salarios por empleado con **checkboxes de pertenencia** a cada planilla (admin/directora/contable).
  - `/reportes/por-terapista` — Tabla comparativa mensual del equipo con KPIs por terapista: asistencia (completed/no_show/late_cancel/reposiciones), carga horaria (trabajadas vs contratadas), cumplimiento de informes cuatrimestrales. Roles: admin, directora, coordinadora_terapias. Cada fila tiene botón de descarga PDF individual; cabecera tiene descarga del PDF del equipo. Incluye **sección de Capacidad histórica** (heatmap últimos 6 meses con tendencia ↑↓→ por terapista).
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

> **IMPORTANTE**: aplicar migraciones manualmente en Supabase Dashboard. No hay
> migración automática. **Aplicar 0134→0142 en orden.** Correr
> `supabase/scripts/verify_pending_migrations.sql` (checks hasta `mig_0142_*`)
> para ver cuáles faltan.
>
> **GOTCHA recurrente**: `create or replace function` con DISTINTO # de args
> NO reemplaza — crea una **sobrecarga** y deja la llamada ambigua. Al cambiar
> la firma de una RPC (compute/confirm del ciclo), agregar un `DROP FUNCTION`
> de la firma vieja en la misma migración.

---

# Estado del proyecto — junio 2026

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
    - Estados de planilla: `draft` (editable) → `sealed` (inmutable, snapshot del config fiscal + snapshot por empleado) → `paid`. Anulable si no está pagada.
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
- **APLICAR migraciones 0134–0141 en Supabase** (en orden) — sin esto, generar
  ciclo / planilla por terapia / despacho fallan. Verificar con verify script.
- (Backlog) Botón "Eliminar niño/a" (admin, con confirmación) en perfil del niño
  — hoy no existe; se borran por SQL.
- (Backlog) Permitir a recepción cobrar/perdonar recogidas tardías (hoy
  `/aprobaciones` está gated solo a admin/directora).
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
