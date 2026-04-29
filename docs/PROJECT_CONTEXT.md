# FM CRM — Project Context

**Última actualización:** 2026-04-28 · commit `4084df9`  
**Rama activa:** `master` (auto-deploy a Vercel)  
**Repo:** https://github.com/dann1103-eng/fm_full_y_connect.git  
**Dir local:** `C:\Users\Daniel\Desktop\FM CRM\fm-crm`  
**Supabase project:** `witcgfylutplgfxvzoab` (us-east-1)

CRM interno para **FM Communication Solutions**. Gestiona clientes, planes, ciclos de facturación mensuales, requerimientos de contenido, pipeline de producción, revisiones de archivos, facturación, control de tiempo, portal de clientes y calendario de operaciones.

---

## 1. Stack

- **Next.js 16.2.4** (App Router + Turbopack) · **React 19.2.4** · **TypeScript**
- **Tailwind v4** (`@import "tailwindcss"`, `@theme`, `@layer utilities`) · **shadcn/ui** · **@base-ui/react** 1.4.0
- **Supabase** — `@supabase/ssr` 0.10.2 · `@supabase/supabase-js` 2.103.3
- **@dnd-kit/core** 6.3.1 — DnD del pipeline
- **react-big-calendar** 1.19.4 + `withDragAndDrop` — calendario
- **@react-pdf/renderer** 4.5.1 — PDFs (facturas, reportes)
- **date-fns 4.1.0** · **next-themes** 0.4.6
- **Vitest v2** (42 tests) · **ESLint 9** (React 19 strict)

### Scripts
```bash
npm run dev          # localhost:3000 (Turbopack)
npm run lint         # baseline: 9 errores pre-existentes react-hooks/set-state-in-effect
npm run build        # verificación final
npm run test         # vitest
git push origin master  # auto-deploy a Vercel (pedir confirmación explícita)
```

---

## 2. Supabase — clientes (nunca confundir)

```ts
// Server components / Server Actions:
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()   // async

// 'use client' components:
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()          // sync

// Admin / bypass RLS (solo en Server Actions):
import { createAdminClient } from '@/lib/supabase/admin'
const supabase = createAdminClient()
```

---

## 3. Estructura de rutas

### `(auth)/` — login con shader Warp.

### `(app)/` — layout con sidebar + TopNav; requiere sesión interna.

| Ruta | Descripción |
|---|---|
| `dashboard/` | Tarjetas por cliente con progreso de ciclo |
| `clients/` · `clients/[id]/` · `clients/[id]/edit/` | CRUD clientes, pipeline, revisión, chat, PDF |
| `pipeline/` | Kanban global multi-cliente con DnD |
| `plans/` | Catálogo de planes |
| `calendario/` | Calendario (personal + general, DnD) |
| `inbox/[conversationId]/` | Chat interno DM/grupo |
| `tiempo/` | Time entries |
| `reports/` | Timesheet + productividad |
| `renewals/` | Ciclos por vencer |
| `billing/invoices/` · `billing/quotes/` · `billing/settings/` | Facturación con PDF |
| `users/` | Gestión de usuarios (admin) |
| `profile/` | Perfil, avatar, prefs |

### `(portal)/` — layout separado; solo usuarios `role = 'client'`.

| Ruta | Descripción |
|---|---|
| `portal/seleccionar-marca` | Selector de empresa si el cliente tiene múltiples |
| `portal/dashboard` | Resumen del ciclo activo del cliente |
| `portal/pipeline` | Pipeline del cliente (5 fases visibles) |
| `portal/calendario` | Calendario read-only de sus requerimientos |
| `portal/facturas` | Sus facturas |

---

## 4. Portal del cliente — arquitectura y componentes

### Layout (`src/app/(portal)/layout.tsx`)
- Requiere `role === 'client'`, sino redirect a `/dashboard` (internos) o `/login`.
- Renderiza `PortalSidebar` + `PortalTopNav` + `main.flex-1.overflow-y-auto`.
- `PortalTopNav` — header sticky h-16 con: nombre de empresa, toggle dark mode, hamburger móvil con drawer.

### Componentes portal (`src/components/portal/`)

| Componente | Rol |
|---|---|
| `PortalTopNav.tsx` | Header fijo: dark mode toggle (next-themes), nav drawer móvil |
| `PortalSidebar.tsx` | Sidebar fija — oculta en móvil |
| `PortalCalendarioClient.tsx` | Calendario RBC read-only; popup al hacer click en evento (título, fase, deadline, notas) |
| `ClientPipelineBoard.tsx` | Board del pipeline del cliente (5 columnas) |
| `ClientRequirementSheet.tsx` | Sheet modal con tabs Chat / Revisión (solo en fase `revision_cliente`) |
| `ActiveClientSwitcher.tsx` | Switcher de empresa si el cliente tiene varias |
| `ThemeToggle.tsx` | Botón icon-only (sol/luna) wrapping `next-themes` |

### Fases del pipeline — portal vs interno

```
12 fases internas (Phase):
  pendiente, proceso_edicion, proceso_diseno, proceso_animacion,
  cambios, pausa, revision_interna, revision_diseno,
  revision_cliente, aprobado, pendiente_publicar, publicado_entregado

5 fases del portal (ClientPhase) — mapeadas por clientPhaseOf():
  diseno           → "En proceso"   ← TODAS las fases de proceso + pausa + revisiones internas
  revision_cliente → "En revisión"  ← única fase interactiva (chat + pines)
  aprobado         → "Aprobado"
  pendiente_publicar → "Pendiente de publicar"
  publicado        → "Publicado"
```

> ⚠️ `CLIENT_PHASE_LABELS.diseno = 'En proceso'` (no 'En diseño'). Ya aplicado en `src/lib/domain/pipeline.ts`.

### RLS portal
- Función `public.is_client_of(client_id uuid)` (migración 0052) — retorna `true` si `auth.uid()` está en `client_users` del cliente.
- Las tablas de review (`review_assets`, `review_versions`, `review_pins`, `review_comments`) tienen **policies aditivas** para clientes gateadas por `phase = 'revision_cliente' AND is_client_of(...)`.

---

## 5. Modelo de datos (tablas principales)

```
users                 → roles: admin | supervisor | operator | client
clients               → billing_cycles → requirements → requirement_phase_logs
                                      ↘ requirement_messages (visible_to_client bool)
                                      ↘ review_assets → review_versions → review_version_files
                                                     ↘ review_pins (file_id FK) → review_comments

clients → client_users (puente) → users (rol: owner | viewer)

clients.max_cambios                      — límite de cambios por requerimiento (default 2)
requirements.phase                       — fase actual (12 valores)
requirements.cambios_count               — contador, se decrementa al anular
requirements.review_started_at          — timestamp al entrar a revision_cliente
requirements.consumption_overrides_json — JSONB override de consumo por ContentType
requirement_cambio_logs.voided / voided_by_user_id / voided_at — auditoría
```

### Cascade delete (orden obligatorio en código)
`requirement_phase_logs → requirements → billing_cycles → clients`  
No hay FK CASCADE en DB; el app borra en secuencia (ver `deleteClient.ts`).

---

## 6. Migraciones aplicadas

| # | Contenido |
|---|---|
| 0001–0050 | Schema base, pipeline, chat, facturación, revisión, realtime |
| 0051 | `calendar_events` table, `time_entries.scheduled_at/duration/attendees` |
| 0052 | Portal: `client_users`, `is_client_of()`, `visible_to_client` en messages |
| 0053 | RLS self-read del cliente |
| 0054 | RLS portal: requirements, billing_cycles, planes, invoices, quotes |
| 0055 | RLS portal: `review_assets/versions/pins/comments` gateados por `revision_cliente` + Storage bucket `review-files` |
| 0056 | `requirement_messages` en publicación realtime |
| 0057 | Auto-billing: `auto_billing` flag, ciclos scheduled |
| 0058 | Realtime para notificaciones |
| 0059 | Multi-consumo (`consumption_overrides_json`) + anulación de cambios |
| 0060 | n1co integration: webhook handler, payment links dinámicos |

> Aplicar manualmente en **Supabase Dashboard → SQL Editor**.

---

## 7. Domain logic (`src/lib/domain/`)

| Módulo | Propósito clave |
|---|---|
| `calendar.ts` | `requirementToCalendarEvent`, `KIND_COLORS` / `KIND_COLORS_DARK`, `isScheduledKind`. Eventos "scheduled" (reunión/producción) tienen hora; "arte" solo deadline. |
| `pipeline.ts` | `PipelineItem`, `clientPhaseOf()`, `CLIENT_PHASE_LABELS` (diseno='En proceso'). |
| `plans.ts` | `effectiveLimits`, `applyContentLimitsWithOverride`, `CONTENT_TYPE_LABELS`. |
| `requirement.ts` | Reglas de requerimiento, límites de semana. |
| `billing.ts` | Facturación e invoices. |

---

## 8. Módulo Calendario — lecciones aprendidas

**Archivos:** `src/app/(app)/calendario/CalendarPageClient.tsx`, `page.tsx`, `src/hooks/useCalendarEvents.ts`, `src/app/actions/calendar.ts`, `src/app/globals.css`.

**Puntos críticos:**

1. **Layout height chain** — El contenedor raíz de `CalendarPageClient` **debe** ser `h-full` (no `min-h-full`). `min-height: 100%` no establece altura definitiva para `flex-1` hijos; `DnDCalendar style={{ height: '100%' }}` colapsaría a cero.

2. **Vista mensual scrolleable** — `globals.css`: `.rbc-month-view { overflow-y: auto }` (no `hidden`). `.rbc-month-view .rbc-row.rbc-month-header { position: sticky; top: 0; z-index: 4 }` para que los nombres de días queden fijos al scrollear. La vista de tiempo sigue con `overflow: hidden`.

3. **Timezone bug (eventos all-day)** — El servidor corre en UTC. `new Date('2024-01-15').toISOString()` produce `...Z`. El browser en UTC-N lo interpreta como el día anterior. **Fix:** serializar eventos all-day sin 'Z': `deadline + 'T00:00:00'` (sin sufijo). Ver `portal/calendario/page.tsx`.

4. **DnD solo para eventos con hora** — `draggableAccessor={(e) => isPrivileged && isScheduledKind(e.kind)}`. Arte no se arrastra.

5. **Imágenes bloquean DnD nativo** — CSS fix en `globals.css`: `.rbc-event img { -webkit-user-drag: none; pointer-events: none }`.

6. **Persistencia post-drop** — `revalidatePath` no sincroniza estado local del hook. Llamar `refetch()` en `handleEventDrop` tras éxito.

7. **CSS specificity** — `@layer utilities` pierde contra CSS sin capa de RBC. Usar `!important` en overrides de `.rbc-month-row`, `.rbc-timeslot-group`, etc.

---

## 8. Módulo Revisión

- **Bucket:** `review-files` (privado).
- **Estructura:** `review_assets → review_versions → review_version_files` (file_order 0..N) + `review_pins (file_id FK) → review_comments → review_comment_mentions`.
- **Extensión en descarga:** extraer ext de `storage_path` para componer `baseName.ext` antes de `createSignedUrl({ download })`. Sin esto el browser genera archivos con extensión aleatoria.
- **Multi-archivo por versión** — `FileThumbnailStrip`, pines por archivo (`file_id`).
- Botón "Nueva versión" gateado si hay pines activos sin resolver.

---

## 9. Server Actions — patrón React 19 seguro

> Nunca `throw` en Server Actions llamadas desde `startTransition`. El error escapa el try-catch y llega a un Error Boundary.

**Patrón correcto:**
```ts
export async function mySafeAction(params: {...}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // ...
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
// En el cliente:
const result = await mySafeAction(params)
if (!result.ok) { setMsg(result.error); return }
```

Aplicado en: `clientUsers.ts` (crear/revocar credenciales portal).

---

## 10. Reglas ESLint que muerden

- **`react-hooks/purity`** — prohibido `Date.now()` en render/hooks; usar `new Date().getTime()`.
- **`react-hooks/set-state-in-effect`** — no `setState` síncrono en el body de `useEffect`. Derivado → `useMemo`. 9 errores pre-existentes (no introducir nuevos).
- `redirect()` de `next/navigation` lanza — siempre última línea en Server Actions.
- `@next/next/no-img-element` — usar `<Image>` de next/image o deshabilitar con comment.

---

## 11. UI — convenciones

- **Colores:** teal `#00675c`, rojo `#b31b25`, gris `#595c5e`.
- **CSS classes:** `glass-panel`, `fm-primary`, `fm-on-surface`, `fm-surface-container-*` — Tailwind custom tokens en `@theme`.
- **Dark mode:** clase `dark` en `<html>` via `next-themes` / `ThemeProvider`. `useTheme()` necesita `mounted` state para evitar hydration mismatch.
- **Material Symbols:** `<span className="material-symbols-outlined">icon_name</span>`.
- **Texto UI y commits en español.** Prefijos: `feat:`, `fix:`, `docs:`, `chore:`, `perf:`.
- **`calendar-wrapper`** — clase obligatoria en el wrapper del calendario para que apliquen los estilos dark de `globals.css`.

---

## 12. Roles / RLS

| Rol | Acceso |
|---|---|
| `admin` | Todo |
| `supervisor` | Pipeline + reportes + calendario general |
| `operator` | Sus asignaciones + tiempo |
| `client` | Solo portal — sus ciclos, requerimientos, facturas |

---

## 13. Commits recientes (sesión 2026-04-28)

```
4084df9  fix: scroll en vista mensual del calendario al hacer zoom
c214205  fix: restaurar vista mensual y scroll en calendario interno
84ea87d  fix(calendario): revertir end=start en eventos all-day + fix timezone portal
e3963b1  feat(portal): header fijo con modo oscuro + fixes calendario cliente
c65b77a  fix(timezone): toda la app usa GMT-6 (America/El_Salvador)
4ed9d94  fix(consumo): override fusiona sobre base en vez de reemplazarla
03fb625  feat(portal): botón Pagar ahora en detalle de factura
f7be471  fix(auth): limpiar auth.users al borrar cliente o revocar credenciales
8c6be05  fix: aprobar/rechazar cambios fallaba por falta de política RLS UPDATE
577a29f  fix(credenciales): patrón React 19 seguro — retornar error en vez de throw en Server Actions
```

---

## 14. Verificación local

- **Login dev:** `danielmancia111203@gmail.com` / `usuario123`
- **Login portal (cliente):** credenciales del cliente creadas desde `clients/[id]/edit/` → pestaña "Portal".
- **Supabase DNS** intermitente desde esta red — reintentar si `ENOTFOUND witcgfylutplgfxvzoab.supabase.co`.
- **HMR dep-size error** al cambiar número de deps en un `useEffect` — reiniciar `npm run dev`.

---

## 15. Plan pendiente — Revisión en fase `revision_cliente`

Existe un plan detallado en:  
`C:\Users\Daniel\.claude\plans\necesito-que-me-ayudes-moonlit-treehouse.md`

**Resumen:** Cuando el staff mueve un requerimiento a `revision_cliente`, el cliente debe poder abrir una sheet con dos tabs:
- **Chat** — mensajes con `visible_to_client=true`
- **Revisión** — última versión de assets + crear pines y comentarios

**Estado:** El plan está escrito y detallado. La migración 0055 (RLS review tables) **ya está aplicada**. Lo que falta implementar en código:

| Archivo | Qué hacer |
|---|---|
| `ClientPipelineBoard.tsx` | Hacer clickeables solo las tarjetas en `revision_cliente`; abrir `ClientRequirementSheet` |
| `ClientRequirementSheet.tsx` | Sheet con tabs Chat / Revisión (componente nuevo, ya existe el archivo creado) |
| `ContentReviewDialog.tsx` | Extraer `ContentReviewPanel` sin overlay; prop `clientMode` |
| `RequirementChat.tsx` | Prop `clientMode` — envía con `visibleToClient: true`, oculta @-menciones |
| `sendRequirementMessage.ts` (action) | Aceptar `visibleToClient?: boolean` |

---

## 16. Pendientes / próximas mejoras

- **Portal revisión (alta prioridad)** — ver sección 15 arriba.
- Normalizar los 9 errores de `react-hooks/set-state-in-effect` pre-existentes.
- Verificación automatizada del DnD del calendario (requiere Playwright con mouse real).
- Consolidar patrón `refetch` en hooks que dependan de `revalidatePath`.
