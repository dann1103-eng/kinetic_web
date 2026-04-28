# FM CRM — Contexto completo + Módulo de Facturación

> Documento generado el 2026-04-27. Usar para retomar trabajo en cualquier sesión nueva.
> Prioridad de información: este doc > CLAUDE.md (CLAUDE.md sigue siendo la referencia de reglas).

---

## 1. Proyecto y stack

**FM CRM** — CRM interno de FM Communication Solutions. Gestiona clientes, ciclos de facturación, requerimientos de contenido, pipeline de producción, revisión de artes, facturación, portal del cliente y control de tiempo.

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js App Router | 16 | Full-stack, server components + server actions |
| React | 19 | UI |
| TypeScript | 5 | Tipado estricto |
| Tailwind CSS | 4 | Estilos (custom tokens con prefijo `fm-*`) |
| Supabase | JS v2 | Postgres + Auth + Storage + Realtime |
| @dnd-kit | — | Drag-and-drop en pipeline |
| react-big-calendar + date-fns | — | Calendario |
| @react-pdf/renderer | — | Generación de PDFs para facturas y cotizaciones |

**Rama principal:** `master` → auto-deploy a Vercel.

---

## 2. Dos clientes Supabase — NUNCA confundir

```ts
// Server components / Server Actions normales:
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()   // async, usa cookies RLS

// 'use client' components:
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()          // sync, usa session del browser

// Admin / Service Role (bypass RLS) — solo en Server Actions que lo requieran:
import { createAdminClient } from '@/lib/supabase/admin'
const supabase = createAdminClient()    // sync, bypass RLS completo
```

---

## 3. Arquitectura de archivos clave

```
src/
├── types/db.ts                    ← Tipos TS manuales (NO auto-generados)
├── lib/
│   ├── supabase/                  ← client.ts | server.ts | admin.ts
│   └── domain/
│       ├── billing.ts             ← Helpers de auto-facturación
│       ├── cycles.ts              ← Fechas de ciclos (firstCycleDates, nextCycleDates, etc.)
│       ├── dates.ts               ← DateString, today(), formatDateEs, parseDate
│       ├── invoices.ts            ← calculateTotals, buildClientSnapshot, suggestItemsFromPlan
│       ├── plans.ts               ← limitsToRecord, CONTENT_TYPE_LABELS, unifiedPoolUsage
│       ├── pipeline.ts            ← PipelineItem, movePhase, clientPhaseOf, PHASE_LABELS
│       ├── requirement.ts         ← consumptionOf, computeTotals, canRegisterBreakdown
│       ├── calendar.ts            ← requirementToCalendarEvent, KIND_COLORS
│       ├── content-icons.ts       ← CONTENT_ICONS (Material Symbols por ContentType)
│       ├── social.ts              ← socialUrl, SocialNetwork
│       └── weekly-distribution.ts ← augmentDistribution, applyOverride, addRollover
├── app/
│   ├── (app)/                     ← Rutas del staff (admin/supervisor/operator)
│   │   ├── dashboard/page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx           ← Lista de clientes con search/filter
│   │   │   └── [id]/
│   │   │       ├── page.tsx       ← Detalle cliente (RequirementPanel + pipeline tab)
│   │   │       ├── edit/page.tsx  ← Edición de datos + datos fiscales + auto_billing toggle
│   │   │       └── report/page.tsx
│   │   ├── pipeline/page.tsx      ← KanbanBoard con DnD (@dnd-kit)
│   │   ├── billing/
│   │   │   ├── page.tsx           ← Dashboard de facturación
│   │   │   ├── invoices/
│   │   │   │   ├── page.tsx       ← Lista de facturas (filtros, búsqueda)
│   │   │   │   ├── new/page.tsx   ← Formulario de nueva factura
│   │   │   │   └── [id]/page.tsx  ← Detalle + acciones (emitir, pagar, anular)
│   │   │   ├── quotes/
│   │   │   │   ├── page.tsx       ← Lista de cotizaciones
│   │   │   │   ├── new/page.tsx   ← Formulario de nueva cotización
│   │   │   │   └── [id]/page.tsx  ← Detalle + acciones (enviar, aceptar, convertir)
│   │   │   └── settings/page.tsx  ← Configuración del emisor (company_settings)
│   │   ├── renewals/page.tsx      ← Ciclos vencidos / pendientes de renovación
│   │   ├── plans/page.tsx         ← CRUD de planes
│   │   ├── calendario/page.tsx    ← Calendario con DnD
│   │   ├── tiempo/page.tsx        ← Control de tiempo por usuario
│   │   ├── inbox/page.tsx         ← Chat interno DM + canales
│   │   ├── usuarios/page.tsx      ← Gestión de usuarios
│   │   └── profile/page.tsx       ← Perfil del usuario logueado
│   ├── (portal)/portal/           ← Portal del cliente
│   │   ├── seleccionar-marca/
│   │   ├── dashboard/
│   │   ├── pipeline/              ← Solo artes en revision_cliente
│   │   ├── calendario/
│   │   ├── facturacion/           ← Vista de facturas/cotizaciones del cliente
│   │   ├── empresa/
│   │   └── config/
│   ├── actions/                   ← 22 Server Actions (ver sección 7)
│   └── api/
│       ├── invoices/[id]/pdf/route.tsx   ← GET → PDF de factura
│       └── quotes/[id]/pdf/route.tsx     ← GET → PDF de cotización
├── components/
│   ├── clients/
│   │   ├── RequirementModal.tsx   ← Modal de registro de requerimiento (isStrictAdmin, h+min)
│   │   ├── RequirementPanel.tsx   ← Panel principal del cliente (stats, weekly, modal)
│   │   ├── RequirementHistory.tsx ← Historial del ciclo + anular cambios
│   │   └── ClientCard.tsx         ← Tarjeta de cliente en dashboard/lista
│   ├── pipeline/
│   │   ├── KanbanBoard.tsx        ← Board con DnD (DnD desactivado en tablet)
│   │   ├── KanbanColumn.tsx       ← Columna del kanban
│   │   ├── PipelineCard.tsx       ← Tarjeta draggable/clickable
│   │   ├── PhaseSheet.tsx         ← Sheet de detalle/mover fase + cambio logs
│   │   ├── MovePhaseModal.tsx     ← Modal de confirmación al soltar DnD
│   │   ├── NewRequirementFromPipeline.tsx
│   │   └── RequirementTimesheet.tsx
│   ├── review/
│   │   ├── ContentReviewDialog.tsx
│   │   ├── ContentReviewPanel.tsx  ← Review assets/versions/pins (clientMode)
│   │   └── RequirementChat.tsx     ← Chat por requerimiento (clientMode)
│   ├── billing/
│   │   ├── InvoiceForm.tsx        ← Formulario de nueva factura
│   │   ├── QuoteForm.tsx          ← Formulario de nueva cotización
│   │   ├── InvoicePDF.tsx         ← Componente PDF (@react-pdf/renderer)
│   │   └── QuotePDF.tsx
│   └── layout/
│       ├── TopNav.tsx             ← sticky top-0 z-30, siempre visible
│       └── Sidebar.tsx
└── contexts/
    └── UserContext.tsx            ← useUser() | useUserOrNull()
```

---

## 4. Tipos principales (src/types/db.ts)

### Enums

```typescript
type ContentType   = 'historia' | 'estatico' | 'video_corto' | 'reel' | 'short'
                   | 'produccion' | 'reunion' | 'matriz_contenido'

type Phase         = 'pendiente' | 'proceso_edicion' | 'proceso_diseno'
                   | 'proceso_animacion' | 'cambios' | 'pausa'
                   | 'revision_interna' | 'revision_diseno'
                   | 'revision_cliente' | 'aprobado' | 'pendiente_publicar'
                   | 'publicado_entregado'

type ClientPhase   = 'diseno' | 'revision_cliente' | 'aprobado'
                   | 'pendiente_publicar' | 'publicado'

type UserRole      = 'admin' | 'supervisor' | 'operator' | 'client'
type ClientStatus  = 'active' | 'paused' | 'overdue'
type CycleStatus   = 'current' | 'archived' | 'pending_renewal' | 'scheduled'
type PaymentStatus = 'paid' | 'unpaid'
type BillingPeriod = 'monthly' | 'biweekly'
type Priority      = 'baja' | 'media' | 'alta'
type PersonType    = 'natural' | 'juridical'

// Facturación
type InvoiceStatus        = 'draft' | 'issued' | 'paid' | 'void'
type QuoteStatus          = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
type InvoicePaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'other'
```

### Client

```typescript
interface Client {
  id: string
  name: string
  status: ClientStatus
  billing_day: number           // día del mes en que se cobra (1-31)
  billing_day_2: number | null  // solo biweekly: segundo día de cobro
  billing_period: BillingPeriod // 'monthly' | 'biweekly'
  current_plan_id: string | null
  max_cambios: number           // límite de cambios por req (default 2)
  notes: string | null
  logo_url: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_name: string | null
  ig_handle: string | null
  fb_handle: string | null
  tiktok_handle: string | null
  yt_handle: string | null
  linkedin_handle: string | null
  website_url: string | null
  other_contact: string | null
  weekly_distribution_json: WeeklyDistribution | null
  created_at: string
  // Datos fiscales (migración 0048)
  legal_name: string | null     // nombre legal/razón social
  person_type: PersonType | null
  nit: string | null
  nrc: string | null
  dui: string | null            // solo persona natural
  fiscal_address: string | null
  giro: string | null
  country_code: string | null   // 'SV' por defecto
  default_tax_rate: number | null  // ej. 0.13 (13% IVA)
  // Auto-billing (migración 0057)
  auto_billing: boolean         // genera factura 10 días antes del cierre
  is_foreign: boolean           // cliente extranjero (sin NIT/NRC salvadoreño)
}
```

### BillingCycle

```typescript
interface BillingCycle {
  id: string
  client_id: string
  plan_id_snapshot: string | null
  limits_snapshot_json: PlanLimits       // snapshot inmutable del plan al crear el ciclo
  rollover_from_previous_json: Partial<PlanLimits> | null
  period_start: string   // YYYY-MM-DD
  period_end: string     // YYYY-MM-DD
  status: CycleStatus    // current | archived | pending_renewal | scheduled
  payment_status: PaymentStatus          // primer pago (o único en monthly)
  payment_date: string | null
  payment_status_2: PaymentStatus | null // solo biweekly: segunda quincena
  payment_date_2: string | null
  cambios_budget: number
  cambios_packages_json: CambiosPackage[]
  extra_content_json: ExtraContentItem[]
  content_limits_override_json: Partial<Record<ContentType, number>> | null
  weekly_distribution_override_json: WeeklyDistribution | null
  created_at: string
}

interface PlanLimits {
  historias: number
  estaticos: number
  videos_cortos: number
  reels: number
  shorts: number
  producciones: number
  reuniones: number
  matrices_contenido: number
  cambios_incluidos: number
  reunion_duracion_horas: number | null
  unified_content_limit: number | null   // plan "Contenido": pool compartido
}
```

### Invoice

```typescript
interface Invoice {
  id: string
  invoice_number: string           // INV-YYYYnnnnnnn (correlativo único por año)
  client_id: string
  billing_cycle_id: string | null  // ciclo al que aplica
  quote_id: string | null          // cotización origen (si se convirtió)
  issue_date: string               // YYYY-MM-DD
  due_date: string | null
  currency: string                 // 'USD'
  subtotal: number
  discount_amount: number
  tax_rate: number                 // ej. 0.13
  tax_amount: number
  total: number
  status: InvoiceStatus
  payment_date: string | null
  payment_method: InvoicePaymentMethod | null
  payment_reference: string | null
  notes: string | null
  client_snapshot_json: ClientFiscalSnapshot   // inmutable al emitir
  emitter_snapshot_json: EmitterSnapshot       // inmutable al emitir
  void_reason: string | null
  void_by: string | null           // user_id
  void_at: string | null           // timestamptz
  created_by: string | null        // user_id
  created_at: string
  updated_at: string
  biweekly_half: 'first' | 'second' | null  // null = monthly
}

interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number     // calculado: quantity * unit_price
  sort_order: number
}

// Snapshots (inmutables — se guardan al crear la factura para que sea auditable)
interface ClientFiscalSnapshot {
  id: string
  name: string
  legal_name: string | null
  person_type: PersonType | null
  nit: string | null
  nrc: string | null
  dui: string | null
  fiscal_address: string | null
  giro: string | null
  country_code: string | null
  contact_email: string | null
  contact_phone: string | null
}

interface EmitterSnapshot {
  legal_name: string
  trade_name: string | null
  nit: string | null
  nrc: string | null
  fiscal_address: string | null
  giro: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  invoice_footer_note: string | null
  payment_methods: PaymentMethodConfig[]
}

interface PaymentMethodConfig {
  id: string
  type: 'bank' | 'card' | 'other'
  label: string
  account_holder: string | null
  account_number: string | null
  account_type: string | null
  note: string | null
}
```

### Quote

```typescript
interface Quote {
  id: string
  quote_number: string           // QUO-YYYYnnnnnnn
  client_id: string
  issue_date: string
  valid_until: string | null
  currency: string               // 'USD'
  subtotal: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  total: number
  status: QuoteStatus
  notes: string | null
  client_snapshot_json: ClientFiscalSnapshot
  emitter_snapshot_json: EmitterSnapshot
  terms_snapshot_json: TermAndCondition[]  // snapshot de T&C al crear
  converted_invoice_id: string | null      // se llena al convertir a factura
  created_by: string | null
  created_at: string
  updated_at: string
}

interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  sort_order: number
}

interface TermAndCondition {
  id: string
  order: number
  text: string
}
```

### CompanySettings

```typescript
// Singleton (solo 1 fila en la tabla)
interface CompanySettings {
  id: string
  legal_name: string               // razón social FM
  trade_name: string | null        // nombre comercial
  nit: string | null
  nrc: string | null
  fiscal_address: string | null
  giro: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  invoice_footer_note: string | null  // texto al pie de facturas
  payment_methods_json: PaymentMethodConfig[]
  terms_and_conditions_json: TermAndCondition[]
  updated_at: string
  updated_by: string | null
}
```

### Requirement

```typescript
interface Requirement {
  id: string
  billing_cycle_id: string
  content_type: ContentType
  title: string
  notes: string | null
  registered_at: string
  registered_by_user_id: string
  voided: boolean
  voided_by_user_id: string | null
  voided_at: string | null
  over_limit: boolean
  cambios_count: number
  priority: Priority
  estimated_time_minutes: number | null
  assigned_to: string[] | null
  includes_story: boolean
  deadline: string | null        // YYYY-MM-DD, obligatorio para tipos no-scheduled
  starts_at: string | null       // timestamptz, reunion/produccion
  phase: Phase
  carried_over: boolean
  review_started_at: string | null
  consumption_overrides_json: Partial<Record<ContentType, number>> | null
  // NULL = consumo legacy (1 del content_type + 1 historia si includes_story)
  // Con valores: reemplaza la lógica legacy completamente
}

interface RequirementCambioLog {
  id: string
  requirement_id: string
  notes: string | null
  created_by: string | null
  created_at: string
  voided: boolean
  voided_by_user_id: string | null
  voided_at: string | null
}
```

---

## 5. Funciones de dominio clave

### src/lib/domain/billing.ts

```typescript
// Constante global
const AUTO_INVOICE_LEAD_DAYS = 10

// ¿Generar factura del siguiente ciclo?
// true si: daysUntilEnd(currentPeriodEnd) ≤ 10 Y no existe factura issued/paid del sig. ciclo
shouldGenerateNextCycleInvoice(
  currentPeriodEnd: DateString,
  existingNextCycleInvoices: Pick<Invoice, 'status' | 'biweekly_half'>[],
  billingPeriod: BillingPeriod,
  today?: DateString
): boolean

// ¿Generar la segunda quincena reactivamente?
// true si: firstInvoice.biweekly_half='first' + status='paid' + no existe 'second' no-void
shouldGenerateBiweeklySecond(
  firstInvoice: Pick<Invoice, 'status' | 'biweekly_half' | 'billing_cycle_id'>,
  existingCycleInvoices: Pick<Invoice, 'status' | 'biweekly_half'>[]
): boolean

// Fechas del siguiente ciclo
computeNextCyclePeriod(
  currentCycle: Pick<BillingCycle, 'period_end'>,
  billingPeriod: BillingPeriod
): { periodStart: DateString; periodEnd: DateString }

// Etiqueta para el ítem precargado de la factura
// monthly: "abril 2026"
// biweekly first: "01 al 15 de abril"
// biweekly second: "16 al 30 de abril"
invoicePeriodLabel(
  periodStart: DateString,
  periodEnd: DateString,
  billingPeriod: BillingPeriod,
  half: 'first' | 'second' | null
): string

// Rango formateado para UI: "27 de abr — 27 de mayo"
formatPeriodRange(periodStart: DateString, periodEnd: DateString): string
```

### src/lib/domain/invoices.ts

```typescript
interface LineItemInput {
  description: string
  quantity: number
  unit_price: number
}

interface TotalsResult {
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  items: Array<LineItemInput & { line_total: number; sort_order: number }>
}

// Calcula totales (redondea a 2 decimales)
calculateTotals(input: {
  items: LineItemInput[]
  tax_rate: number
  discount_amount?: number
}): TotalsResult

// Genera snapshot del cliente al momento de emitir la factura
buildClientSnapshot(client: Client): ClientFiscalSnapshot

// Genera snapshot del emisor (company_settings) al momento de emitir
buildEmitterSnapshot(settings: CompanySettings): EmitterSnapshot

// Ítems precargados por defecto basados en el plan del cliente
// Default: una línea "Plan {name} — {periodLabel}"
suggestItemsFromPlan(plan: Plan, periodLabel?: string): LineItemInput[]

// Formateador de moneda (locale es-SV)
formatCurrency(value: number, currency?: string): string   // '$1,250.00'
```

### src/lib/domain/cycles.ts

```typescript
// Fechas del primer ciclo a partir de una fecha de inicio
firstCycleDates(
  startDate: DateString,
  options?: { billingPeriod?: BillingPeriod }
): { periodStart: DateString; periodEnd: DateString }
// monthly: periodEnd = startDate + 1 mes - 1 día
// biweekly: periodEnd = startDate + 13 días (14 días total)

// Fechas del ciclo siguiente dado el fin del ciclo anterior
nextCycleDates(
  previousPeriodEnd: DateString,
  options?: { billingPeriod?: BillingPeriod }
): { periodStart: DateString; periodEnd: DateString }
// periodStart = previousPeriodEnd + 1 día

// Días hasta el fin del ciclo (negativo si ya venció)
daysUntilEnd(periodEnd: DateString, referenceDate?: DateString): number

// ¿Es urgente renovar? (daysUntilEnd ≤ 3)
isRenewalDue(periodEnd: DateString, referenceDate?: DateString): boolean
```

### src/lib/domain/requirement.ts

```typescript
// Desglose de consumo efectivo de un requerimiento
// Si consumption_overrides_json tiene valores: usa eso
// Si no: legacy (1 del content_type + 1 historia si includes_story)
consumptionOf(r: Requirement): Partial<Record<ContentType, number>>

// Totales del ciclo (suma consumptionOf de todos los req no-voided no-carried_over)
computeTotals(requirements: Requirement[]): RequirementTotals

// Valida si se puede registrar un breakdown completo contra los límites
canRegisterBreakdown(
  breakdown: Partial<Record<ContentType, number>>,
  totals: RequirementTotals,
  limits: Record<ContentType, number>
): { ok: boolean; exceeded?: ContentType }

// Valida si se puede registrar un tipo simple (wrapper de canRegisterBreakdown)
canRegisterWithContext(
  type: ContentType,
  totals: RequirementTotals,
  limits: Record<ContentType, number>,
  ctx: { week: number; cycle: BillingCycle; client: Client }
): { ok: boolean; reason?: string }
// ctx.week: semana actual del ciclo (0-3)
// Puede retornar reason='Pago pendiente...' si la semana está bloqueada (biweekly)

// ¿Está la semana desbloqueada para registrar reqs?
// S1-S2 (week 1-2): necesita payment_status='paid'
// S3-S4 (week 3-4): necesita payment_status_2='paid' (biweekly)
isWeekUnlocked(week: 1|2|3|4, cycle: BillingCycle, client: Client): boolean
```

---

## 6. Módulo de Facturación — Detalle completo

### 6.1 Modelo de datos

**Tablas principales:**

| Tabla | Descripción |
|---|---|
| `invoices` | Facturas con snapshots inmutables de cliente y emisor |
| `invoice_items` | Líneas de cada factura |
| `quotes` | Cotizaciones |
| `quote_items` | Líneas de cada cotización |
| `company_settings` | Singleton con datos fiscales de FM (emisor) |

**Campos extendidos en `clients`** (migración 0048 + 0057):
- `legal_name`, `person_type`, `nit`, `nrc`, `dui`, `fiscal_address`, `giro`, `country_code`, `default_tax_rate`
- `auto_billing: boolean` — activa generación automática de facturas
- `is_foreign: boolean` — cliente extranjero (sin datos fiscales SV)
- `billing_period: 'monthly'|'biweekly'`

**RPCs en PostgreSQL:**
```sql
SELECT next_invoice_number()  -- INV-YYYY0000001, INV-YYYY0000002, ...
SELECT next_quote_number()    -- QUO-YYYY0000001, QUO-YYYY0000002, ...
-- Correlativo secuencial por año, se reinicia cada 1 de enero
```

### 6.2 Estados de una factura

```
draft → issued → paid
  ↓        ↓      ↓
void     void   void
```
- `draft`: borrador editable (se puede eliminar)
- `issued`: emitida (enviada al cliente, ya no editable)
- `paid`: pagada (sincroniza `billing_cycles.payment_status`)
- `void`: anulada con `void_reason`, `void_by`, `void_at`

### 6.3 Flujo completo de facturación mensual

```
[Cron diario 6 AM UTC]
    ↓
Para cada ciclo 'current' con auto_billing=true:
    ↓
¿period_end ≤ 10 días?
    ├─ SÍ → 1. ensureScheduledCycle() → crea/reutiliza ciclo status='scheduled'
    │        2. createInvoice({ biweeklyHalf: null, billingCycleId: scheduled.id })
    │        3. issueInvoice(id)  ← queda en status='issued'
    └─ NO → skip

[Admin marca factura como pagada]
    ↓
markInvoicePaid({ id, paymentMethod, paymentDate })
    ↓
invoice.status = 'paid'
billing_cycle.payment_status = 'paid'  (biweekly_half=null → actualiza ambos campos)
    ↓
revalidatePath('/billing', '/clients/[id]', '/renewals', '/dashboard')

[Cron: ciclo vencido + pagado]
    ↓
billing_cycle.status = 'archived'
scheduled_cycle.status → 'current'
```

### 6.4 Flujo biweekly (quincenalmente)

```
[Cron: 10 días antes del cierre del ciclo actual]
    ↓
createInvoice({ biweeklyHalf: 'first', billingCycleId: scheduled.id })
issueInvoice(id)  ← Cubre S1-S2 del siguiente ciclo

[Admin marca primera quincena como pagada]
    ↓
markInvoicePaid({ id: firstInvoiceId, paymentMethod: ... })
    ↓
invoice.biweekly_half === 'first'
→ billing_cycle.payment_status = 'paid'    ← desbloquea S1-S2
→ generateBiweeklySecondIfNeeded() ←────── REACTIVO (no cron)
    ↓
Chequea: ¿existe factura 'second' no-void para este ciclo?
    ├─ SÍ → no hacer nada
    └─ NO → calcula periodo S3-S4
           suggestItemsFromPlan(plan, "16 al 30 de abril")
           createInvoice({ biweeklyHalf: 'second', ... })
           issueInvoice(id)

[Admin marca segunda quincena como pagada]
    ↓
billing_cycle.payment_status_2 = 'paid'   ← desbloquea S3-S4
```

### 6.5 Server Actions de facturación

**src/app/actions/invoices.ts**

```typescript
// Crear borrador de factura
createInvoice(input: CreateInvoiceInput): Promise<{ ok: true; invoiceId; invoiceNumber } | { error }>

interface CreateInvoiceInput {
  clientId: string
  billingCycleId?: string | null    // ciclo al que aplica
  quoteId?: string | null           // si viene de una cotización
  items: LineItemInput[]
  taxRate: number                   // ej. 0.13
  discountAmount?: number
  dueDate?: string | null
  notes?: string | null
  biweeklyHalf?: 'first' | 'second' | null
}

// Emitir (draft → issued)
issueInvoice(id: string): Promise<{ ok: true } | { error }>

// Marcar como pagada — sincroniza billing_cycle
// si biweekly_half='first' → también lanza generateBiweeklySecondIfNeeded()
markInvoicePaid(args: {
  id: string
  paymentMethod: InvoicePaymentMethod
  paymentDate?: string
  paymentReference?: string | null
}): Promise<{ ok: true } | { error }>

// Anular con trazabilidad
voidInvoice(id: string, reason: string): Promise<{ ok: true } | { error }>

// Crea o reutiliza billing_cycle status='scheduled' para el cliente
// Usado cuando el admin factura manualmente el siguiente ciclo
ensureScheduledCycle(clientId: string): Promise<{ ok: true; cycleId } | { error }>

// Elimina borrador (solo status='draft')
deleteInvoiceDraft(id: string): Promise<{ ok: true } | { error }>
```

**src/app/actions/quotes.ts**

```typescript
createQuote(input: CreateQuoteInput): Promise<{ ok: true; quoteId; quoteNumber } | { error }>

interface CreateQuoteInput {
  clientId: string
  items: LineItemInput[]
  taxRate: number
  discountAmount?: number
  validUntil?: string | null
  notes?: string | null
}

sendQuote(id: string): Promise<...>           // draft|sent → sent
markQuoteAccepted(id: string): Promise<...>   // → accepted
markQuoteRejected(id: string): Promise<...>   // → rejected
deleteQuoteDraft(id: string): Promise<...>    // solo draft

// Crea factura desde cotización aceptada, enlaza quote.converted_invoice_id
convertQuoteToInvoice(quoteId: string): Promise<{ ok: true; invoiceId; invoiceNumber } | { error }>
```

### 6.6 Edge Function: daily-cycle-runner

**Ubicación:** `supabase/functions/daily-cycle-runner/index.ts`  
**Schedule:** `0 6 * * *` (6 AM UTC diario)  
**Permisos:** usa Service Role (bypass RLS)

**Fase 1 — Auto-billing (antes del vencimiento):**
1. Busca todos los ciclos `status='current'` donde el cliente tiene `auto_billing=true`
2. Para cada uno: si `daysUntil(period_end) ≤ AUTO_INVOICE_LEAD_DAYS (10)`:
   - Crea `billing_cycle` con `status='scheduled'` para el siguiente período (si no existe)
   - Llama `next_invoice_number()` RPC
   - Inserta factura con `status='issued'`, `biweekly_half='first'|null`
   - Vincula al ciclo scheduled

**Fase 2 — Expiración y renovación:**
1. Busca ciclos `status='current'` donde `period_end < hoy`
2. Si `payment_status='paid'`:
   - Ciclo actual → `status='archived'`
   - Limpia `requirement-attachments` (storage quota Free)
   - Si existe `scheduled` → mueve a `current`; si no, crea ciclo nuevo fallback
3. Si `payment_status='unpaid'`:
   - Ciclo → `status='pending_renewal'`
   - Cliente → `status='overdue'`

### 6.7 API Routes — PDF

**GET `/api/invoices/[id]/pdf`**
- Verifica permisos: staff (admin/supervisor/operator) o `client_users` del cliente
- Carga factura con ítems
- Renderiza `<InvoicePDF>` con `@react-pdf/renderer`
- Retorna PDF con `Content-Disposition: attachment; filename="INV-YYYYnnnnnnn.pdf"`

**GET `/api/quotes/[id]/pdf`**
- Igual pero para cotizaciones
- Incluye términos y condiciones del snapshot
- Filename: `QUO-YYYYnnnnnnn.pdf`

### 6.8 Portal del cliente — Facturación

Ruta: `src/app/(portal)/portal/facturacion/page.tsx`
- El cliente puede ver sus facturas e invoices (solo `issued` y `paid`)
- Puede descargar PDFs
- No puede crear, emitir ni marcar como pagadas

---

## 7. Todos los Server Actions

| Archivo | Funciones exportadas |
|---|---|
| `invoices.ts` | `createInvoice`, `issueInvoice`, `markInvoicePaid`, `voidInvoice`, `ensureScheduledCycle`, `deleteInvoiceDraft` |
| `quotes.ts` | `createQuote`, `sendQuote`, `markQuoteAccepted`, `markQuoteRejected`, `deleteQuoteDraft`, `convertQuoteToInvoice` |
| `company-settings.ts` | `saveCompanySettings` |
| `cambioLogs.ts` | `voidCambioLog(logId)` — solo admin, decrementa cambios_count |
| `contentPackage.ts` | `renewContentPackage`, `addCambiosPackage`, `addExtraContent` |
| `deleteClient.ts` | `deleteClient` — borra en cascada (phase_logs → reqs → cycles → client) |
| `fetchRequirementCycleStats.ts` | `fetchRequirementCycleStats` — stats para reportes |
| `fetchTimesheet.ts` | `fetchTimesheet` — timesheet del usuario |
| `plans.ts` | `createPlan`, `updatePlan`, `deletePlan` |
| `profile.ts` | `updateProfile` |
| `time.ts` | `startTimer`, `stopTimer`, `createManualEntry`, `deleteTimeEntry` |
| `updateUserDefaultAssignee.ts` | `updateUserDefaultAssignee` |
| `updateUserRole.ts` | `updateUserRole` |
| `users.ts` | `createUser`, `inviteUser` |
| `inbox.ts` | `sendMessage`, `markRead`, `createChannel`, etc. |
| `calendar.ts` | `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent` |
| `content-review.ts` | `createAsset`, `createVersion`, `addPin`, `addComment`, `resolvePin`, etc. |
| `clientUsers.ts` | `listClientUsers`, `addClientUser`, `removeClientUser` |
| `portalActiveClient.ts` | `setPortalActiveClient`, `getPortalActiveClient` |
| `renewals.ts` | `requestRenewal`, `approveRenewal` |
| `clientProfile.ts` | `updateClientProfile` |
| `requirement-messages.ts` | `sendRequirementMessage`, `toggleMessageVisibility` |
| `agencySettings.ts` | `saveAgencySettings` |

---

## 8. Trabajo pendiente en facturación (de la sesión de brainstorming)

Los siguientes cambios fueron **diseñados y aprobados** pero **NO implementados** todavía. Son el trabajo a continuar en la próxima sesión.

### 8.1 Búsqueda de cliente en "Nueva factura" (en lugar de dropdown)

**Problema:** El selector de cliente en `InvoiceForm.tsx` (y `QuoteForm.tsx`) es un `<select>` que con muchos clientes resulta difícil de usar.

**Solución:** Reemplazar con una caja de búsqueda tipo combobox:
- Input de texto con búsqueda en tiempo real (filtra por `name` o `legal_name`)
- Lista desplegable de resultados mientras escribe
- Al seleccionar, muestra el nombre y avatar
- Puede implementarse con un componente `<ClientSearchInput>` reutilizable
- **Archivos a modificar:** `src/app/(app)/billing/invoices/new/page.tsx`, `src/app/(app)/billing/quotes/new/page.tsx`, o los componentes `InvoiceForm.tsx` / `QuoteForm.tsx` si existen

### 8.2 Auto-facturación 10 días antes del cierre

**Estado actual:** La lógica de `shouldGenerateNextCycleInvoice` y el cron `daily-cycle-runner` YA EXISTEN y están implementados en el backend (`src/lib/domain/billing.ts` + `supabase/functions/daily-cycle-runner/`).

**Lo que FALTA:**
- **El toggle `auto_billing`** en la ficha del cliente YA FUE IMPLEMENTADO en esta sesión (en `src/app/(app)/clients/[id]/edit/page.tsx`) — está funcional.
- Verificar que el cron realmente corra en Supabase (Scheduled Functions). Revisar en el dashboard de Supabase → Edge Functions → daily-cycle-runner → Schedule.
- El cron genera la factura automática pero la deja en `status='issued'` — el admin debe marcarla como pagada manualmente.

### 8.3 Facturar ciclo siguiente (no el actual)

**Regla de negocio acordada:**
- Al crear un cliente por primera vez → facturar el ciclo actual (solo esta vez)
- En todos los ciclos siguientes → al abrir "Nueva factura", la UI debe **sugerir el ciclo siguiente** porque el actual ya debería estar pagado
- `ensureScheduledCycle(clientId)` ya existe para crear/reutilizar el ciclo scheduled

**Lo que FALTA en UI:**
- En `InvoiceForm` (o `new/page.tsx`): detectar si el cliente ya tiene ciclos previos (no es cliente nuevo)
- Si sí → preseleccionar automáticamente `billing_cycle_id = scheduled_cycle.id` en lugar del ciclo current
- Mostrar banner informativo: "Facturando ciclo siguiente (mayo 2026)" vs "Facturando ciclo actual"
- Si el cliente es nuevo (sin facturas previas) → preseleccionar ciclo current

### 8.4 Alterar fecha de facturación + alterar ciclo

**Funcionalidad:** Cuando el admin cambia la fecha de `issue_date` en una factura, ofrecerle también cambiar las fechas del `billing_cycle` asociado.

**Lo que FALTA:**
- En la página de edición de factura (`/billing/invoices/[id]`) o en el formulario
- Al cambiar `issue_date`: mostrar opción "¿Quieres también ajustar las fechas del ciclo?"
- Si sí → inputs para `period_start` y `period_end` del ciclo
- Server action: `updateInvoiceDates(invoiceId, issueDate, cyclePeriodStart?, cyclePeriodEnd?)`

### 8.5 Etiqueta de período en ítems biweekly precargados

**Regla acordada:**
- Biweekly **primera quincena (ciclo 1)**: ítem dice "01 al 15 de [mes]"
- Biweekly **segunda quincena (ciclo 2)**: ítem dice "16 al 30 de [mes]"

**Estado actual:** `invoicePeriodLabel()` ya calcula esta etiqueta correctamente. `generateBiweeklySecondIfNeeded()` ya la usa al auto-crear la segunda quincena.

**Lo que FALTA:**
- Verificar que en `InvoiceForm` al crear una factura biweekly manualmente, el ítem precargado use `invoicePeriodLabel()` con los parámetros correctos del ciclo seleccionado
- Si el admin selecciona un ciclo biweekly + half='first' → ítem "01 al 15 de abril"
- Si half='second' → ítem "16 al 30 de abril"

### 8.6 Bloqueo de semanas cuando hay factura sin pagar (biweekly)

**Estado actual:** `isWeekUnlocked()` en `requirement.ts` ya bloquea S3-S4 si `payment_status_2='unpaid'`. `RequirementPanel` muestra el overlay de bloqueo. `canRegisterWithContext()` verifica antes de crear un req.

**Lo que FALTA (según brainstorming):**
- El trigger de bloqueo debería basarse en si hay una **factura `issued` sin pagar**, no solo en el campo `payment_status`
- Actualmente `payment_status` se actualiza cuando se marca `markInvoicePaid()` — entonces el bloqueo funciona si el ciclo de pagos es correcto
- Revisar si hay edge case: ciclo biweekly donde no se generó factura automática pero igualmente el campo `payment_status_2='unpaid'` bloquea semanas

---

## 9. Migraciones (orden cronológico)

| # | Contenido clave |
|---|---|
| 0001–0006 | Schema inicial, pipeline base |
| 0007 | Bucket `client-logos` |
| 0008 | `cambios_count`, `clients.max_cambios` |
| 0009 | Rename `consumptions` → `requirements` |
| 0010–0018 | Chat, cambios, facturación v1, time entries, supervisor |
| 0019 | 12 fases del pipeline actuales |
| 0020–0024 | Multi-asignación, logs de cambios, matriz contenido |
| 0025 | Split timer: `worked_seconds` vs `standby_seconds` |
| 0026–0039 | Adjuntos, planes biweekly, distribution overrides |
| 0040–0043 | Inbox chat, menciones, `agency-assets` |
| 0044 | Sistema de revisión (review_assets/versions/pins/comments) |
| 0045 | Bucket `review-files` |
| **0048** | **BILLING COMPLETO** (invoices, quotes, company_settings, campos fiscales en clients) |
| 0049 | `review_version_files` |
| 0050–0051 | Realtime messaging, `calendar_events` |
| **0052** | **Portal cliente**: `client_users`, `is_client_of()`, RLS base |
| 0053–0055 | RLS portal: requirements, review, storage |
| 0056–0058 | Realtime notifications, auto_billing, notificaciones |
| **0059** | **Multi-consumo** (`consumption_overrides_json`) + **anular cambios** (voided en cambio_logs) |

---

## 10. Patrones de código importantes

### Validación de admin en Server Actions

```typescript
// Patrón estándar — siempre al inicio de cada action de billing
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }
  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin') return { error: 'Solo admins...' as const }
  return { userId: user.id }
}
// Uso:
const auth = await requireAdmin()
if ('error' in auth) return { error: auth.error as string }
```

### Clientes Supabase por contexto

```typescript
// En Server Actions de billing: siempre admin para bypass RLS
const admin = createAdminClient()  // Service Role

// En Server Components normales:
const supabase = await createClient()  // con cookies del usuario

// NUNCA usar createClient() del servidor para writes en billing
// porque las tablas tienen RLS que requiere admin
```

### Commits y mensajes

```
feat: descripción en español
fix: descripción en español
chore: descripción en español
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

### Dark mode

Clase `dark` en `<html>` gestionada por `next-themes`.  
Custom tokens en `globals.css`: `--fm-primary`, `--fm-secondary-fixed`, etc.  
Siempre definir tokens en ambas secciones `:root` y `.dark`.

### Material Symbols (iconos)

```tsx
<span className="material-symbols-outlined">icon_name</span>
```

---

## 11. RLS y permisos

```
admin      → todo (incluyendo billing, datos fiscales, anular cambios)
supervisor → leer/crear reqs, mover pipeline, ver facturas (NO crear/pagar)
operator   → leer/crear reqs asignados, mover pipeline, NO billing
client     → solo portal (is_client_of), NO acceso app interna
```

**Función clave:** `public.is_client_of(client_id uuid)` — retorna true si `auth.uid()` está en `client_users` del cliente dado.

**Trigger fiscal:** `clients_fiscal_admin_only()` — bloquea updates a campos fiscales para no-admins a nivel de DB.

---

## 12. Datos de FM Communication Solutions (emisor)

Ver `src/app/actions/company-settings.ts` y la tabla `company_settings`.  
Los datos del NIT, NRC, dirección fiscal, etc. están en `company_settings` (configurable en `/billing/settings`).  
Los snapshots de estos datos se guardan en cada factura en `emitter_snapshot_json` al momento de crearla.

---

## 13. Storage

| Bucket | Visibilidad | Uso |
|---|---|---|
| `client-logos` | Público | Logos de clientes |
| `agency-assets` | Privado | Logo FM, assets de agencia |
| `requirement-attachments` | Público | Archivos del chat de reqs (limpiados al archivar ciclo) |
| `review-files` | Privado | Artes/versiones del sistema de revisión |
| `avatars` | Público | Avatares de usuarios |

---

## 14. Notas de implementación para la próxima sesión

1. **Empezar por la búsqueda de cliente (8.1)** — es el cambio más visible y más fácil de aislar. Crear componente `ClientSearchInput` reutilizable y aplicarlo en `InvoiceForm` y `QuoteForm`.

2. **Luego lógica de ciclo siguiente (8.3)** — en `InvoiceForm`, detectar si el cliente tiene facturas previas (`invoices` con ese `client_id`) y preseleccionar el ciclo adecuado.

3. **Alterar fechas (8.4)** — requiere un pequeño modal de confirmación en la página de edición de factura.

4. **El toggle `auto_billing` ya funciona** — está en `/clients/[id]/edit`. La lógica del cron ya existe. Solo verificar que el cron esté activo en Supabase Dashboard → Edge Functions.

5. **Biweekly labels (8.5)** — revisión menor en `InvoiceForm` para que use `invoicePeriodLabel()` al precargar ítems.

6. Al iniciar sesión: leer este documento + CLAUDE.md + memory files:
   - `C:\Users\Daniel\.claude\projects\C--Users-Daniel-Desktop-FM-CRM\memory\project_fm_crm.md`
   - `C:\Users\Daniel\.claude\projects\C--Users-Daniel-Desktop-FM-CRM\memory\project_fm_fiscal_data.md`
