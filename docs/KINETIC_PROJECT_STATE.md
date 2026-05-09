# Kinetic — Estado técnico del proyecto + tareas pendientes

> Documento de handoff actualizado al **2026-05-08**, último commit `7b8f66e`.
> Diseñado para que un dev (humano o agente) pueda continuar sin contexto previo.
> Va en orden: **(1) qué existe hoy**, **(2) cómo ejecutar las próximas fases**.

---

## 1. Repo, deploy y entornos

| Ítem | Valor |
|---|---|
| **GitHub** | `https://github.com/dann1103-eng/kinetic_web` |
| **Branch productiva** | `master` |
| **Worktree de trabajo actual** | `C:\Users\Daniel\Desktop\Kinetic Web\.claude\worktrees\eager-chaplygin-ffc7ab` (en branch `claude/eager-chaplygin-ffc7ab`, espejo de master) |
| **Hosting** | Vercel — proyecto `kinetic_web` |
| **URL pública** | `https://kinetic-web-rho.vercel.app` |
| **`vercel.json`** | Fuerza `framework: "nextjs"` (sin esto Vercel lo detectó como "Other" y servía 404) |
| **`next.config.ts`** | `typescript.ignoreBuildErrors: true` (TEMP — los tipos de tablas Kinetic no están en `Database`; ver §10 cleanup) |

### Stack

- **Next.js 16.2.4** (App Router, Turbopack default — lee `node_modules/next/dist/docs/` antes de cambios sensibles, hay breaking changes vs versiones previas)
- React 19, TypeScript 5, Tailwind CSS 4
- Supabase: Postgres + Auth + Storage + Realtime (`@supabase/ssr`, `@supabase/supabase-js@2`)
- shadcn/ui + `@base-ui/react` (Dialog primitive en `src/components/ui/dialog.tsx`)
- `@dnd-kit`, `react-big-calendar`, `date-fns`, `date-fns-tz`
- `@react-pdf/renderer` (instalado pero NO se usa todavía en Kinetic — usado en FM legacy)

### Convención de archivo Next.js 16

- Middleware se llama `proxy.ts` (no `middleware.ts`). Vive en `src/proxy.ts` y exporta `proxy()`.
- Default export `nextConfig` y `serverExternalPackages: ['@react-pdf/renderer']` ya configurado.

### Variables de entorno requeridas en Vercel

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | URL del proyecto Supabase Kinetic |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sí | Key pública |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | Admin client (impersonación, gestión usuarios). Solo en Production+Preview, **no** en Development |
| `NEXT_PUBLIC_SITE_URL` | recomendada | URL pública para redirects post-login |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | recomendada | Mismo valor que SITE_URL — usado por links de pago |
| `GOOGLE_*` (Calendar/Meet) | opcional | Fase 2 parcialmente implementada — sin esto, agendar virtual falla pero el resto anda |
| `N1CO_*`, `LIVEKIT_*` | irrelevante | Legacy FM, **no se usan en Kinetic** |

---

## 2. Base de datos — migraciones aplicadas

Las migraciones viven en **dos directorios** y **se aplican manualmente** en Supabase Dashboard → SQL Editor (no hay CI de migraciones todavía).

### `supabase/migrations/` (FM legacy, 0001–0058+)

Forman la base FM CRM heredada — schema de `users`, `clients`, `requirements`, `invoices`, etc. Detalles en el `CLAUDE.md` raíz. **Ya están aplicadas en el Supabase de Kinetic** porque la migración `0002_to_0079_merged.sql` de Kinetic depende de ellas.

### `supabase/migrations-kinetic/` (Kinetic)

Aplicar **en este orden** sobre el proyecto Supabase de Kinetic. Las que tienen ⚠ son fixes necesarios — no las saltar.

| # | Archivo | Qué hace |
|---|---|---|
| 0002–0079 | `0002_to_0079_merged.sql` | Merge consolidado de las migraciones FM aplicadas + helpers (`is_admin`, `is_agency_user`) + extensión de `users.role` check con roles Kinetic + RLS base |
| 0091 | `0091_kinetic_families_and_children.sql` | Tablas `families`, `family_users`, `referral_sources`. Agrega `family` al CHECK de `users.role`. |
| 0092 | `0092_kinetic_appointments.sql` | Tablas `appointments`, `institutional_calendar`. Helper `is_family_of_child(uuid)`. |
| 0093 | `0093_kinetic_sessions_and_journal.sql` | Tablas `therapy_sessions`, `child_journal_entries`. RPCs `start_therapy_session`, `finish_therapy_session`. Trigger inmutabilidad. Extensión `moddatetime` habilitada. |
| 0094 | `0094_kinetic_session_reports.sql` | Tabla `session_reports`. RPCs `submit_session_report`, `approve_session_report`, `reject_session_report`. Helper `is_directora_or_admin()`. |
| ⚠ 0095 | `0095_kinetic_session_reports_impersonation.sql` | Fix: `submit_session_report` acepta `is_admin()` además de `auth.uid() = therapist_id` (para que admin impersonando funcione). |
| ⚠ 0096 | `0096_kinetic_journal_impersonation.sql` | Fix: RLS INSERT de `child_journal_entries` acepta `is_admin()` además de `author_user_id = auth.uid()`. |
| 0097 | `0097_kinetic_progress_reports.sql` | Tabla `progress_reports` (informes de avances cuatrimestrales). RPCs `submit_progress_report`, `approve_progress_report`, `reject_progress_report`. UNIQUE(child, service_type, period_starts). |

### Próximas migraciones (numeración reservada, **NO aplicadas aún**)

`0098+` queda libre para C2/C3/C4 (ver §11–§13).

---

## 3. Modelo de datos clave

### Roles (`public.users.role`)

```
'admin' | 'supervisor' | 'operator'              ← FM legacy
'client'                                          ← FM portal padres (legacy, no se usa en Kinetic)
'directora' | 'coordinadora_familias' | 'coordinadora_terapias'
'terapista' | 'maestra' | 'recepcion' | 'contable'
'family'                                          ← portal padres Kinetic
```

Tipo TypeScript: `UserRole` en `src/types/db.ts`.

### Tablas principales del dominio Kinetic

```
families
  └─ family_users (id, user_id, family_id, role, can_billing, can_work)
  └─ children (clínico: blood_type, allergies, hospital, school, diagnoses, treatment_status, intake_phase…)

referral_sources (colegios, doctores, redes, etc.)

institutional_calendar (cierres y asuetos)

appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, parent_appointment_id, recurrence_rule…)
  └─ therapy_sessions (1 por appointment terapia, status active|completed)
       └─ session_reports (1 por session, FLUJO APROBACIÓN)
             campos: actividades, respuesta_del_nino, tarea_para_casa, observaciones_internas
             status: draft|submitted|approved|rejected|sent_to_family
             control: visible_to_family, submitted_at, approved_by_user_id, approved_at, rejected_*, sent_to_family_at

child_journal_entries (agenda digital terapista↔familia, libre)
  category: home_exercise|observation|question|response

progress_reports (informes cuatrimestrales por niño + tipo de terapia, UNIQUE(child,service,period_start))
  data_json (JSONB): seguimiento, dificultades_ingreso, objetivos_terapeuticos,
                     actividades_ejercicios, logros_obtenidos, orientaciones_casa, recomendaciones
  status, visible_to_family, submitted_at, approved_*, rejected_*, sent_to_family_at
```

### Helpers SQL (todos `SECURITY DEFINER`)

| Función | Devuelve | Definida en |
|---|---|---|
| `public.is_admin()` | bool | `0002_to_0079_merged.sql` |
| `public.is_agency_user()` | bool — todos los roles staff | `0002_to_0079_merged.sql` |
| `public.is_directora_or_admin()` | bool | `0094` |
| `public.is_family_of_child(uuid)` | bool | `0092` |
| `public.handle_new_user()` | trigger — copia auth → public.users | `migrations/0001_init.sql` |

---

## 4. Auth, RLS, impersonación

### Convención dual de cliente Supabase

```ts
// Server components y server actions:
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()    // ← async, lee cookies

// 'use client':
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()           // ← sync

// Acciones que requieren bypass RLS (impersonación, gestión usuarios):
import { createAdminClient } from '@/lib/supabase/admin'
const supabase = createAdminClient()      // ← service role
```

### `getEffectiveUser()` (`src/lib/auth/effective-user.ts`)

Resuelve "quién es" la app actualmente:
- `authUser.id` = `auth.uid()` (real, nunca cambia)
- `appUser` = el efectivo (puede ser el impersonado si admin tiene cookie `fm_impersonate_user_id`)
- `realAppUser` = el admin real
- `isImpersonating` = `true` solo si admin real impersona a no-admin

**Regla:** páginas filtran por `appUser.id` (efectivo). **Mutaciones DEBEN usar el efectivo también** — los server actions de Kinetic ya lo hacen via helper `getActor()` (ver §5).

### Patrón RLS (Kinetic)

Todas las tablas Kinetic siguen este patrón **dual** — admin escape para que la impersonación funcione:

```sql
-- SELECT: staff completo + dueño + (familia si visible)
USING (
  public.is_agency_user()
  OR therapist_id = auth.uid()
  OR (status = 'sent_to_family' AND visible_to_family AND public.is_family_of_child(child_id))
)

-- INSERT: el dueño efectivo, o admin (para impersonación)
WITH CHECK (therapist_id = auth.uid() OR public.is_admin())

-- UPDATE: dueño + estado válido, con admin override en política separada
USING  (therapist_id = auth.uid() AND status IN ('draft','rejected'))
WITH CHECK (therapist_id = auth.uid() AND status IN ('draft','rejected','submitted'))

-- (política separada de admin)
USING  (public.is_admin())
WITH CHECK (public.is_admin())

-- DELETE: solo admin
USING (public.is_admin())
```

Las **transiciones de estado** (submit/approve/reject) van por **PL/pgSQL `SECURITY DEFINER` + `FOR UPDATE` lock**, no por UPDATE directo. Mirá `submit_session_report` en `0094`/`0095` como referencia canónica.

### Routing por rol — `src/proxy.ts`

| Rol | Login redirige a | En rutas staff | En `/portal/*` |
|---|---|---|---|
| `admin`, `directora`, `terapista`, etc. | `/dashboard` | OK | redirect → `/dashboard` |
| `client` (FM legacy) | `/portal/dashboard` | redirect → `/portal/dashboard` | OK |
| `family` (Kinetic) | `/portal/agenda-digital` | redirect → `/portal/agenda-digital` | whitelist en layout (ver abajo) |

### Aislamiento del portal family — `src/app/(portal)/layout.tsx`

La rama family corta antes del flujo FM:
- Whitelist `FAMILY_ALLOWED_PREFIXES = ['/portal/agenda-digital']` — cualquier otra ruta `/portal/*` redirige al home.
- Renderiza `PortalSidebar` y `PortalTopNav` con `mode='kinetic-family'` → solo se muestran items con flag `kineticFamily: true` (hoy: solo "Agenda digital").

---

## 5. Server actions — convención

Todas las acciones de Kinetic siguen el mismo patrón:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'

/** Respeta impersonación. */
async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

export async function someAction(...): Promise<
  | { ok: true; data: SomeType }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()
  const { data, error } = await supabase.rpc('some_rpc', { ... })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('rpc_specific_code')) return { ok: false, error: 'Mensaje en español.' }
    return { ok: false, error: 'Error genérico.' }
  }
  revalidatePath('/ruta-relevante')
  return { ok: true, data: data as SomeType }
}
```

**Archivos clave:**
- `src/app/actions/therapy-sessions.ts` — start/finish session
- `src/app/actions/child-journal.ts` — journal entries
- `src/app/actions/session-reports.ts` — reportes por sesión (Fase 3-B)
- `src/app/actions/progress-reports.ts` — informes cuatrimestrales (Fase 3-C1)
- `src/app/actions/familyUsers.ts` — gestión accesos portal family
- `src/app/actions/appointments.ts` — citas (Fase 2-C)

---

## 6. Módulos implementados

### Fase 0 — Setup técnico + branding *(parcial)*

- ✅ Repo Vercel + Supabase nuevos
- ✅ Sidebar Kinetic con roles correctos
- ⏳ Falta: logo Kinetic vectorial, paleta final, datos fiscales BEGINNINGS S.A. de C.V.

### Fase 1 — Núcleo familiar y clínico *(✅ implementado)*

- Tablas `families` + `children` + `family_users` + `referral_sources` (mig 0091)
- Página `/familias` (lista) y `/familias/[id]` (detalle)
- Detalle de niño en `/familias/[id]/children/[childId]` con datos clínicos
- Genera código de niño en `ChildForm`

### Fase 2-C — Agenda + cierres institucionales *(✅ implementado, sin Meet)*

- Tabla `appointments` + `institutional_calendar` (mig 0092)
- Vista `/agenda` con calendario big calendar
- Server actions `appointments.ts` (createAppointment, updateAppointment, rescheduleAppointment)
- ⏳ Falta: integración real Google Calendar/Meet (env vars + service account)

### Fase 3-A — `/mi-dia` (vista del terapista) *(✅)*

- `/mi-dia` accesible para roles `terapista` y `maestra`
- Iniciar/finalizar sesión con cronómetro drift-free (`session.started_at` autoritativo)
- Server actions `therapy-sessions.ts` con RPCs atómicos

### Fase 3-D — Agenda digital (terapista ↔ familia) *(✅)*

- Tabla `child_journal_entries` (mig 0093)
- Componentes `ChildJournal`, `JournalEntryComposer`, `JournalEntryList`
- Categorías: home_exercise, observation, question, response
- Visible a familia con flag, defensa profundidad (server-side filter + RLS)
- Visible en portal `/portal/agenda-digital` (PortalJournalClient)
- Visible en `/familias/[id]` (JournalTab por niño)

### Fase 3-B — Reportes por sesión *(✅, ver §7)*

### Fase 3-C1 — Informes de avances cuatrimestrales *(✅, ver §8)*

### Gestión de accesos portal family *(✅, agregado fuera del plan)*

- Página central `/usuarios-portal` (admin/directora only)
- Server actions `familyUsers.ts`: list / create multi / update / revoke
- Genera password aleatorio, muestra credenciales una vez
- Toggle de permisos `can_billing` / `can_work` por familia

---

## 7. Fase 3-B — Reportes por sesión (ya implementada)

**Decisiones cerradas:** B2 (4 campos fijos, no per-tipo) + aprobación obligatoria + visible default ON + modal en `/mi-dia` tras Finalizar.

### Flujo

```
Terapista finaliza sesión → modal SessionReportModal
  → Llena {actividades, respuesta_del_nino, tarea_para_casa, observaciones_internas}
  → status='draft' → "Enviar a aprobación" → status='submitted'
  → Directora abre /aprobaciones → ve el reporte → "Aprobar" o "Rechazar con motivo"
  → Si aprobado y visible_to_family → status='sent_to_family' (atomic en mismo RPC)
  → Si rechazado → vuelve a status='rejected' con rejection_reason; terapista corrige y reenvía
  → Familia ve en /portal/agenda-digital sección "Reportes recientes" (últimos 20)
  → Staff ve histórico en /familias/[id]/children/[childId] (sección "Reportes de sesión")
```

### Archivos clave

```
supabase/migrations-kinetic/
  0094_kinetic_session_reports.sql        ← tabla + RPCs
  0095_*_impersonation.sql                ← fix admin escape

src/types/db.ts                           ← SessionReport, SessionReportStatus
src/app/actions/session-reports.ts        ← acciones
src/components/agenda/
  SessionReportModal.tsx                  ← formulario terapista
  SessionCard.tsx                         ← UI status-aware (Llenar/Esperando/Aprobado/Corregir)
  ChildSessionReportsHistory.tsx          ← histórico por niño (staff)
src/components/aprobaciones/
  SessionReportApprovalList.tsx
  SessionReportApprovalCard.tsx
src/components/portal/
  SessionReportsList.tsx                  ← vista familia (sin observaciones_internas)
src/app/(app)/aprobaciones/page.tsx       ← bandeja directora
src/app/(portal)/portal/agenda-digital/page.tsx  ← vista familia
```

---

## 8. Fase 3-C1 — Informes de avances cuatrimestrales (ya implementada)

**Decisiones cerradas:** una plantilla hardcoded compartida (no per-tipo todavía), 7 secciones del v0.7, mismo flujo de aprobación que B.

### Plantilla (`src/lib/domain/progress-report-template.ts`)

7 secciones con flag `required`:
1. **seguimiento** ✱
2. dificultades_ingreso
3. objetivos_terapeuticos
4. actividades_ejercicios
5. **logros_obtenidos** ✱
6. orientaciones_casa
7. recomendaciones

✱ = requerido para `submit`. Validado en RPC (`length(trim(...)) > 0`) y en cliente.

### Flujo

```
Terapista en /familias/[id]/children/[childId]
  → "+ Nuevo informe de avances" (NewProgressReportButton)
  → Modal: tipo terapia + período (default últimos 4 meses)
  → createProgressReport() crea draft + redirige a /informe-avances/[reportId]
  → Editor con header autorrellenado (nombre, edad, escolaridad, diagnóstico, terapista)
  → 7 textareas + checkbox visible_to_family
  → "Guardar borrador" o "Enviar a aprobación"
  → Aprobación en /aprobaciones (sección "Informes de avances", separada de reportes de sesión)
  → Familia ve en /portal/agenda-digital sección "Informes de avances" (arriba de session reports)
```

### Archivos clave

```
supabase/migrations-kinetic/0097_kinetic_progress_reports.sql

src/types/db.ts                           ← ProgressReport, ProgressReportData, ProgressReportStatus
src/lib/domain/progress-report-template.ts ← plantilla hardcoded (compartida staff/portal)
src/app/actions/progress-reports.ts

src/app/(app)/familias/[id]/children/[childId]/
  page.tsx                                ← agrega NewProgressReportButton + ChildProgressReportsHistory
  informe-avances/[reportId]/page.tsx     ← editor

src/components/agenda/
  ProgressReportEditor.tsx                ← formulario completo con sticky save bar
  NewProgressReportButton.tsx             ← modal create (servicio + período)
  ChildProgressReportsHistory.tsx         ← lista en ficha del niño

src/components/aprobaciones/
  ProgressReportApprovalList.tsx
  ProgressReportApprovalCard.tsx          ← expandible para ver contenido completo

src/components/portal/
  ProgressReportsList.tsx                 ← vista familia
```

---

## 9. Estructura de directorios (mapa rápido)

```
src/
├─ proxy.ts                                ← middleware (Next 16 naming)
├─ app/
│  ├─ layout.tsx                           ← root layout (theme, providers globales)
│  ├─ globals.css                          ← Tailwind tokens fm-* (paleta queda FM por ahora)
│  ├─ (auth)/
│  │  └─ login/page.tsx
│  ├─ (app)/                               ← layout staff con Sidebar + TopNav
│  │  ├─ layout.tsx
│  │  ├─ dashboard/, agenda/, mi-dia/, aprobaciones/, familias/, usuarios-portal/, …
│  │  └─ familias/[id]/children/[childId]/informe-avances/[reportId]/page.tsx
│  ├─ (portal)/                            ← layout portal (FM o Kinetic family según rol)
│  │  └─ portal/
│  │     ├─ agenda-digital/                ← Kinetic family
│  │     ├─ dashboard/, pipeline/, calendario/, facturacion/, empresa/, config/  ← FM legacy
│  │     └─ seleccionar-marca/, sin-acceso/ ← FM legacy
│  ├─ actions/                             ← server actions ('use server')
│  ├─ api/                                 ← route handlers (PDFs, webhooks)
│  └─ auth/callback/, auth/signout/        ← Supabase auth
├─ components/
│  ├─ ui/                                  ← shadcn (button, dialog, input, label, …)
│  ├─ layout/                              ← Sidebar, MobileSidebar, TopNav, SpectatorBanner
│  ├─ portal/                              ← PortalSidebar, PortalTopNav, ProgressReportsList, SessionReportsList
│  ├─ families/                            ← FamilyForm, ChildForm
│  ├─ agenda/                              ← SessionCard, SessionReportModal, ProgressReportEditor, NewProgressReportButton, ChildJournal, etc.
│  └─ aprobaciones/                        ← SessionReport*, ProgressReport* approval components
├─ lib/
│  ├─ supabase/{server,client,admin}.ts
│  ├─ auth/effective-user.ts               ← getEffectiveUser, IMPERSONATE_COOKIE
│  └─ domain/                              ← lógica pura (appointment overlap helpers, progress-report-template, etc.)
├─ types/db.ts                             ← TypeScript types (manuales, NO autogenerados)
└─ contexts/UserContext.tsx                ← useUser hook (lanza si no hay Provider)

supabase/
├─ migrations/                             ← FM legacy (0001-0058)
├─ migrations-kinetic/                     ← 0091-0097
├─ functions/                              ← edge functions (daily-cycle-runner, FM legacy)
└─ seeds/                                  ← seeds locales NO commiteados (.gitignored si nombre kinetic_test_*)

docs/
├─ KINETIC_PROJECT_STATE.md                ← este documento
└─ superpowers/specs|plans/                ← specs y planes del flujo brainstorming
```

---

## 10. Deuda técnica conocida (a fixear cuando entren las próximas fases)

| # | Item | Cómo fixear |
|---|---|---|
| TD-1 | `next.config.ts` tiene `typescript.ignoreBuildErrors: true` | Agregar las tablas Kinetic (`families`, `children`, `appointments`, `therapy_sessions`, `child_journal_entries`, `session_reports`, `progress_reports`, `family_users`, `institutional_calendar`, etc.) al type `Database` en `src/types/db.ts` con sus `Row`/`Insert`/`Update`. Después quitar la flag. ~2-3 horas. |
| TD-2 | Hardcoded role checks duplicados | Hay arrays `STAFF_ROLES_SCHEDULE`, `ALLOWED_ROLES` en varias páginas. Centralizar en `src/lib/auth/roles.ts`. |
| TD-3 | `appointments.ts` no usa `getEffectiveUser()` | Si admin impersona, no puede crear/editar citas en nombre de la coordinadora. Replicar el patrón `getActor()` de las acciones de Kinetic. |
| TD-4 | Items FM viejos en portal sidebar/topnav | Cuando definamos qué páginas del portal sirven para Kinetic, limpiar los items con `kineticFamily: false` que ya no aplican. |
| TD-5 | No hay paleta Kinetic | `globals.css` sigue con tokens `fm-*`. Cuando llegue el logo vectorial + brief, renombrar a `kinetic-*` o agregar como aliases. |
| TD-6 | Datos fiscales hardcoded FM | `company_settings` table tiene datos FM. Pendiente NIT/NRC de BEGINNINGS S.A. de C.V. del cliente. |
| TD-7 | Edge function `daily-cycle-runner` (FM) | Sigue corriendo cron 6am, no aplica a Kinetic. Desactivar o reemplazar cuando lleguemos a billing Kinetic. |

---

## 11. Fase 3-C2 — Plantillas multi-template DB-driven (PENDIENTE)

> Sigue después de C1. Permite que la directora cree distintas plantillas de informe (Lenguaje, Sensorial, Conductual, etc.) sin tocar código.

### Por qué

Hoy `progress-report-template.ts` tiene UNA plantilla común para todas las terapias. El plan v0.7 (líneas 290-350 del plan estratégico en `~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md`) indica que cada terapista usa un estilo distinto y que las recomendaciones a veces son lista plana, a veces subdivididas en áreas. Necesitamos plantillas configurables.

### Spec

#### Migración `0098_kinetic_report_templates.sql`

```sql
create table public.report_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('progress','session','evaluation','morning_program_quarterly')),
  service_type  text,                   -- null = aplica a cualquier terapia
  blocks_json   jsonb not null,         -- ver schema más abajo
  default_signers_role text,            -- p.ej. 'terapista_principal'
  active        boolean not null default true,
  version       int not null default 1,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index report_templates_kind_service on public.report_templates(kind, service_type) where active;

-- progress_reports.template_id (nullable; null = usar plantilla hardcoded legacy)
alter table public.progress_reports
  add column template_id uuid references public.report_templates(id) on delete restrict;
```

**Schema de `blocks_json`** (TypeScript en `src/types/db.ts`):

```ts
export interface ReportTemplateBlock {
  key: string                     // único dentro de la plantilla, p.ej. 'seguimiento'
  label: string                   // título visible
  description?: string            // ayuda para terapista
  required: boolean
  kind: 'rich_text' | 'numbered_list' | 'categorized_text' | 'recommendations_by_area'
  placeholder?: string
  // Si kind === 'recommendations_by_area':
  areas?: { key: string; label: string }[]   // p.ej. [{key:'casa',label:'Para casa'}, {key:'colegio',label:'Para colegio'}]
}

export interface ReportTemplate {
  id: string
  name: string
  kind: 'progress' | 'session' | 'evaluation' | 'morning_program_quarterly'
  service_type: string | null
  blocks_json: ReportTemplateBlock[]
  default_signers_role: string | null
  active: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string
}
```

#### RLS

```sql
alter table public.report_templates enable row level security;

create policy "rt select all staff" on public.report_templates for select
  using (public.is_agency_user());

create policy "rt mutate directora admin" on public.report_templates for all
  using (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());
```

#### Server actions — `src/app/actions/report-templates.ts`

```
listReportTemplates(kind, serviceType?)  → ReportTemplate[]
getReportTemplate(id)                    → ReportTemplate
createReportTemplate(input)              → { ok, template }
updateReportTemplate(id, input)          → { ok, template }   // bumpea version, marca old inactive si breaking
toggleTemplateActive(id, active)         → { ok }
```

#### Cambios en C1 ya implementado

1. `progress_reports`: agregar `template_id` y migrar la plantilla hardcoded a un seed inicial.
2. `ProgressReportEditor` ahora carga `blocks_json` del template asignado y renderiza dinámicamente según `kind` del bloque.
3. `NewProgressReportButton` agrega selector de plantilla (filtrado por `service_type`).
4. `data_json` en `progress_reports` queda con keys = block keys del template (sigue siendo flexible).

#### UI nueva — `/aprobaciones/plantillas` o `/admin/plantillas`

Página solo para admin/directora con CRUD básico:
- Lista plantillas activas/inactivas
- Form con repeater de bloques (key, label, kind, required, areas si aplica)
- Vista previa: render del editor con esa plantilla

#### Pasos para ejecutar

1. **Brainstorming previo:** confirmar con el equipo clínico de Kinetic cuántas plantillas quieren al inicio (probablemente 2-3 + la "genérica") y qué bloques tendría cada una. Sin esto, hacés la infra pero el seed queda especulativo.
2. Migración 0098 + seed inicial con la plantilla hardcoded de C1.
3. Tipos TS + actions.
4. Página de admin de plantillas (CRUD).
5. Refactor de `ProgressReportEditor` para cargar template dinámicamente. Renderiza por `block.kind`.
6. Idem `NewProgressReportButton` (selector de plantilla).
7. Idem `ProgressReportApprovalCard` y `ProgressReportsList` del portal — leen `template.blocks_json` para etiquetar campos.
8. Migrar reportes existentes: bulk update `template_id = '<plantilla-genérica-seed>'`.

**Estimado:** 5-7 días.

---

## 12. Fase 3-C3 — PDF + firmas con JVPP/JVPM (PENDIENTE)

> Genera PDF descargable del informe aprobado con header (datos del niño), footer (firma terapista + directora + logo Beginnings) y cuerpo desde `data_json`/`blocks_json`.

### Por qué

Hoy la familia ve el informe inline en `/portal/agenda-digital`. Para reembolsos a aseguradoras la familia necesita un **PDF firmado** con número de Junta de Vigilancia (JVPP psicología o JVPM médica) de la terapista responsable + sello/firma de la Directora General.

### Spec

#### Migración `0099_kinetic_professional_signatures.sql`

```sql
create table public.professional_signatures (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references public.users(id) on delete cascade,
  full_name           text not null,         -- p.ej. "Licda. Tania Abigail Meléndez Mejía"
  profession          text not null check (profession in (
    'psicologa','fisioterapeuta','terapista_ocupacional','terapista_lenguaje','medico','directora_general','otra'
  )),
  council_type        text check (council_type in ('JVPP','JVPM','otro')),
  council_number      text,                  -- p.ej. "12141"
  council_label_full  text,                  -- pre-formateado: "J.V.P.P. No. 12141"
  signature_image_url text,                  -- bucket signatures
  stamp_image_url     text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- Bucket Storage: 'signatures' (privado). Path: signatures/{user_id}/{kind}.png
-- RLS: agency users SELECT, admin INSERT/UPDATE/DELETE
```

Seed inicial (de v0.7):
- Licda. Josselin Castro (Directora General, JVPP pendiente)
- Licda. Tania Abigail Meléndez Mejía — JVPP 12141
- Licda. Estefany Judith Cruz Vásquez — JVPP 11102
- Licda. Diana Patricia Mancía Ayala — JVPP 10989
- Licda. Jenny Elizabeth Palacios Portillo — JVPM 907

#### `company_settings` (ya existe del FM, agregar campos)

```sql
alter table public.company_settings
  add column if not exists center_full_name text,           -- "Centro de Desarrollo y Estimulación Intelectual KINETIC"
  add column if not exists fiscal_legal_name text,          -- "BEGINNINGS, S.A. de C.V."
  add column if not exists fiscal_nit text,
  add column if not exists fiscal_nrc text,
  add column if not exists fiscal_address text,
  add column if not exists logo_url text;
```

#### Generación PDF — `@react-pdf/renderer`

Ya está instalado. Patrón canónico ya usado en FM en `src/components/reports/TimesheetPdfReport.tsx`.

Crear `src/components/reports/pdf/ProgressReportPdf.tsx`:

```tsx
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'

const styles = StyleSheet.create({ /* ... */ })

interface Props {
  report: ProgressReport
  template: ReportTemplate
  child: Child
  therapist: ProfessionalSignature
  directora: ProfessionalSignature
  companySettings: CompanySettings
}

export function ProgressReportPdf({ report, template, child, therapist, directora, companySettings }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header autorrellenado */}
        <View style={styles.header}>
          <Text style={styles.centerName}>{companySettings.center_full_name}</Text>
          <Text style={styles.reportTitle}>Informe de Avances — {SERVICE_TYPE_LABELS[report.service_type]}</Text>
          <View style={styles.childData}>
            <Text>Nombre: {child.full_name}</Text>
            <Text>Edad: {ageText} · Escolaridad: {child.school_name} ({child.school_grade})</Text>
            <Text>Diagnóstico: {child.diagnoses_display_text}</Text>
            <Text>Período: {formatDate(report.period_starts)} – {formatDate(report.period_ends)}</Text>
          </View>
        </View>

        {/* Cuerpo: secciones según template */}
        {template.blocks_json.map(block => (
          <View key={block.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{block.label}</Text>
            <Text style={styles.sectionBody}>{report.data_json[block.key]}</Text>
          </View>
        ))}

        {/* Footer firmas */}
        <View style={styles.footer} fixed>
          <View style={styles.signatureBlock}>
            <Image src={therapist.signature_image_url} style={styles.signature} />
            <Text>{therapist.full_name}</Text>
            <Text>{therapist.council_label_full}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Image src={directora.signature_image_url} style={styles.signature} />
            <Text>{directora.full_name}</Text>
            <Text>Directora General</Text>
          </View>
          <Image src={companySettings.logo_url} style={styles.logo} />
          <Text style={styles.fiscal}>{companySettings.fiscal_legal_name}</Text>
        </View>
      </Page>
    </Document>
  )
}
```

#### Route handler — `src/app/api/reports/progress/[id]/pdf/route.ts`

```ts
import { renderToStream } from '@react-pdf/renderer'

export async function GET(req, { params }) {
  // 1. Auth: getEffectiveUser, validar acceso (staff o family con visible)
  // 2. Cargar report + template + child + signatures + company_settings
  // 3. const stream = await renderToStream(<ProgressReportPdf ... />)
  // 4. return new Response(stream as any, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="..."` }})
}
```

#### UI

- En `/familias/.../informe-avances/[id]` cuando `status='approved'` o `'sent_to_family'`: botón "Descargar PDF" → abre `/api/reports/progress/[id]/pdf`.
- En `/portal/agenda-digital` ProgressReportsList: botón "Descargar PDF" en cada card aprobada.
- En el detalle del PDF: Caché. Idealmente persistir el PDF en Storage (`bucket=reports`) para no regenerar cada vez. Opcional para v1.

#### UI — gestión de firmas (`/usuarios` o `/admin/firmas`)

CRUD para que admin/directora suba firmas/sellos por terapista. Re-usa el patrón de upload de `agency-assets`.

#### Pasos para ejecutar

1. **Pedir al cliente:** logo Kinetic vectorial (SVG/AI/PDF), firmas escaneadas de cada profesional, NIT/NRC. Sin esto el PDF queda con placeholders.
2. Migración 0099 + bucket Storage `signatures` con RLS.
3. Seed inicial de `professional_signatures` con los 5 nombres ya identificados (council_number cuando llegue).
4. Update `company_settings` con datos fiscales reales.
5. Componente `ProgressReportPdf.tsx` + route handler.
6. UI download buttons en staff y portal family.
7. UI gestión de firmas (uploader).
8. Testing: descargar PDF como staff, como familia. Verificar que funciona en mobile (Vercel lambda timeout).

**Estimado:** 4-6 días (más si el cliente tarda en entregar logo + firmas + datos fiscales).

---

## 13. Fase 3-C4 — Recordatorios automáticos (PENDIENTE)

> Cada 4 meses (cuatrimestre) recordar a la terapista que tiene un informe pendiente por tipo de terapia activa de cada niño.

### Spec

#### Detección de "informe pendiente"

Una terapia activa de un niño tiene "informe pendiente" si:
- El niño tiene `treatment_status = 'active'` y un `appointment` con esa terapia en los últimos 4 meses.
- Y NO hay `progress_reports` para `(child_id, service_type, periodo_actual_4m)` con `status IN ('submitted','approved','sent_to_family')`.

"Periodo actual" = `[hoy - 4 meses, hoy]` con boundaries calculadas en zona América/El_Salvador.

#### Implementación: 2 opciones

**A. Edge function (cron) — recomendado**

Crear `supabase/functions/progress-reports-reminder/index.ts`:

```ts
// Cron: '0 8 * * MON' (lunes 8am SV)
// 1. Para cada terapista activa (role='terapista','maestra','psicologa', etc.):
//    - Listar sus pacientes activos (children via appointments en últ. 4m)
//    - Por cada (child, service_type), chequear si falta informe del periodo
//    - Si faltan ≥3 informes O queda < 7 días para fin de cuatrimestre: notificar
// 2. Insertar fila en `notifications` (tabla FM existente) con kind='progress_report_due'
//    o enviar email vía Resend/Supabase email.
```

Configurar en `supabase/config.toml` el schedule.

**B. Cliente-side (banner en `/mi-dia`)**

Más simple, sin infra cron. En `mi-dia/page.tsx` (server component):

```ts
// Calcular en el server component: ¿hay informes pendientes?
const pendingProgress = await detectPendingProgressReports(therapistId)
// Si hay >0, renderizar banner arriba de la lista de citas:
<PendingProgressReportsBanner count={pendingProgress.length} children={pendingProgress} />
```

Ventaja: instantáneo, sin cron. Desventaja: solo lo ve cuando entra a `/mi-dia` (no proactivo).

**Recomendación:** empezar con B (banner) para validar que la detección funciona; agregar A (cron + email) cuando confirmemos.

#### Pasos para ejecutar (opción B)

1. Crear `src/lib/domain/progress-reports-pending.ts` con `detectPendingProgressReports(therapistId)` puro.
2. Component `PendingProgressReportsBanner.tsx` en `src/components/agenda/`.
3. Integrar en `/mi-dia/page.tsx` (server) — query + render condicional.
4. Idem en `/aprobaciones` para que la directora vea quién tiene pendiente (vista resumen).

**Estimado:** 2-3 días (B). +3-4 días extra para A (cron + email).

---

## 14. Fases siguientes (después de Fase 3 completa)

Resumen del plan estratégico (`~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md`):

| Fase | Scope | Estimado |
|---|---|---|
| **4** | Motor de reposiciones + cuarentenas + recargos | 1.5 sem |
| **5** | Programas matutinos (BlueKids/LearningKids/Aula) — cuadernillo diario, asistencia, indicadores, informe cuatrimestral programa | 2-2.5 sem |
| **6** | Evaluaciones estructuradas (test_catalog WISC/CARAS/SENA/etc, evaluation_reports dual mode, formularios externos) | 2.5 sem |
| **7** | Pagos + matrícula + ciclos mensuales variables + ficha de acuerdo digital + suspensión automática | 2 sem |
| **8** | Contabilidad básica | 1 sem |
| **9** | Pipeline de paciente (12 fases) + dashboards | 1 sem |
| **10** | QA + capacitación + go-live | 1 sem |

---

## 15. Cómo retomar en otra sesión

1. **Clonar y posicionarse:**
   ```bash
   git clone https://github.com/dann1103-eng/kinetic_web
   cd kinetic_web
   git checkout master
   npm install
   ```

2. **Configurar `.env.local`** con las mismas vars de Vercel (ver §1).

3. **Confirmar Supabase migrations:** correr en Supabase SQL Editor en orden, las que falten:
   - `migrations/0001_init.sql` y siguientes (FM legacy)
   - `migrations-kinetic/0091` → `0097` (en orden)

4. **Leer estos 3 archivos antes de tocar nada:**
   - `CLAUDE.md` (raíz) — convenciones FM heredadas
   - `AGENTS.md` (raíz) — recordatorio Next 16 breaking changes
   - `docs/KINETIC_PROJECT_STATE.md` (este archivo) — qué hay y qué falta

5. **Para empezar una fase nueva, seguir el flujo Superpowers:**
   - `superpowers:brainstorming` para refinar requerimientos con el usuario
   - Escribir spec en `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
   - `superpowers:writing-plans` para plan ejecutable
   - `superpowers:executing-plans` o `subagent-driven-development` para ejecutar
   - `superpowers:requesting-code-review` antes de mergear

6. **Convenciones que NO romper:**
   - Server actions usan `getActor()` → siempre respetan impersonación
   - Mutaciones de estado vía RPC `SECURITY DEFINER` con `FOR UPDATE` lock (no UPDATE directo)
   - RLS dual: política dueño + política admin override
   - Defensa profundidad en frontend portal (filter server-side AUNQUE RLS ya filtre — ej. nunca renderizar `observaciones_internas` en family even si llega)
   - Commits en español con prefijo `feat|fix|chore|docs(kinetic)`
   - Co-Authored-By en commits que vengan de un agente

7. **Pendientes inmediatos antes de fase nueva:**
   - Cliente debe entregar: logo vectorial, NIT/NRC BEGINNINGS, paleta confirmada, firmas escaneadas (para C3), confirmación Google Workspace (para Meet en Fase 2)
   - TD-1 (quitar `ignoreBuildErrors`) idealmente antes de C2

---

## 16. Personas / accesos (al 2026-05-08)

- **Owner del repo GitHub:** `dann1103-eng` (Daniel Mancia)
- **Email principal:** `danielmancia111203@gmail.com`
- **Vercel team:** `danielmancia111203-2224s-projects`
- **URL Vercel:** `kinetic-web-rho.vercel.app`
- **Supabase project Kinetic:** definido por env var; revisar dashboard del owner
- **Familias de prueba creadas en Supabase (no commitear nombres reales):** ver via `select primary_contact_name from families` — NO incluir en docs públicos.

> ⚠️ **Privacidad:** la memoria del proyecto explícitamente prohíbe usar nombres reales de familias/niños de Kinetic en seeds, ejemplos o código. Usar nombres ficticios siempre que se deje algo en repo.
