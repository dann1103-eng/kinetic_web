'use server'

/**
 * cycle-charge-sync.ts — el cobro del ciclo sigue a la agenda.
 *
 * Se llama después de crear / borrar / mover una cita de terapia. Si el mes ya
 * tiene ciclo generado, re-sincroniza `sessions_per_month` del snapshot con las
 * citas reales y recalcula `payment_amount_usd`. Así una terapia extra que la
 * familia pidió se cobra sola, en vez de quedar agendada pero sin cobrar.
 *
 * Ciclo PENDIENTE  → se ajusta el monto (y se regenera la factura si ya existía).
 * Ciclo PAGADO     → no se toca lo cobrado; la diferencia se arrastra al mes
 *                    siguiente vía `billing_adjustment_usd` (mismo mecanismo que
 *                    usa `upsertTreatmentPlan` al cambiar el plan de un mes ya
 *                    pagado, migs 0177/0178).
 * Ciclo ANULADO    → no se toca.
 *
 * Usa el admin client a propósito: quien agenda (una terapista, por ejemplo) no
 * necesariamente pasa `kn_can_manage_cycles()` en RLS, pero ya pasó el control de
 * permisos de agendar. Sin esto el ajuste fallaría en silencio.
 *
 * Además del sync automático por cita, expone la revisión POR MES
 * (`previewMonthChargeSync` / `applyMonthChargeSync`): los ciclos generados antes
 * de que existiera el sync quedaron desalineados y hay que emparejarlos una vez.
 */

import { fromZonedTime } from 'date-fns-tz'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { expectedCycleAmount } from '@/lib/domain/billing/cycle-edit'
import { isMonthlyFlatEntry } from '@/lib/domain/billing/monthly-flat'
import {
  billableSessionCounts,
  therapiesSyncedToAgenda,
  type ChargeableAppt,
} from '@/lib/domain/billing/agenda-charge-sync'
import { isChildPaused } from '@/lib/domain/intake-pipeline'
import { createInvoiceForCycle } from './kinetic-invoices'
import type {
  DiscountKind,
  MonthlySessionCycle,
  ServiceCatalogItem,
  TreatmentPlanTherapyEntry,
} from '@/types/db'

const TZ = 'America/El_Salvador'

/** Roles que pueden revisar/aplicar la sincronización de cobros de un mes. */
const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]

type AdminClient = ReturnType<typeof createAdminClient>

/** Precio de catálogo de una terapia individual (BK-aware). 0 = sin precio. */
function catalogPrice(
  catalog: ServiceCatalogItem[],
  service: string,
  isMorningChild: boolean,
): number {
  const item = catalog.find(
    (c) => c.active && c.category === 'terapia_individual' && c.service_type === service,
  )
  if (!item) return 0
  if (isMorningChild && item.unit_price_bk_usd != null) return Number(item.unit_price_bk_usd)
  return Number(item.unit_price_usd ?? 0)
}

/** Una terapia cuyo cobro no coincide con la agenda. */
export interface ChargeSyncLine {
  service: string
  /** Sesiones que cobra el ciclo hoy. */
  charged: number
  /** Sesiones que hay realmente en la agenda del mes. */
  scheduled: number
}

/** Lo que cambiaría (o cambió) en un ciclo al emparejarlo con su agenda. */
export interface ChargeSyncPlan {
  cycleId: string
  childId: string
  periodMonth: string
  paymentStatus: 'pending' | 'paid'
  currentAmount: number
  newAmount: number
  lines: ChargeSyncLine[]
  therapies: TreatmentPlanTherapyEntry[]
  snapshot: Record<string, unknown>
  /** Servicios agendados sin precio de catálogo: quedan sin cobrar. */
  unpricedServices: string[]
  hasInvoice: boolean
}

/**
 * Calcula (SIN escribir) cómo quedaría el cobro de un ciclo si siguiera a su
 * agenda. Devuelve null si no hay nada que cambiar.
 */
async function buildChargeSyncPlan(
  admin: AdminClient,
  cycle: MonthlySessionCycle,
): Promise<ChargeSyncPlan | null> {
  if (cycle.status !== 'generated') return null

  const periodMonth = String(cycle.period_month).slice(0, 10)
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString()

  const { data: apptsRaw } = await admin
    .from('appointments')
    .select('service_type, status, event_type')
    .eq('child_id', cycle.child_id)
    .eq('event_type', 'terapia')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)

  const counts = billableSessionCounts((apptsRaw ?? []) as ChargeableAppt[])
  if (counts.size === 0) return null

  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
    [k: string]: unknown
  }
  const current = snapshot.therapies_json ?? []
  if (current.length === 0) return null

  // Precio de catálogo solo si aparece un servicio que no está en el plan.
  const known = new Set<string>(current.map((t) => t.service))
  let catalog: ServiceCatalogItem[] = []
  if ([...counts.keys()].some((s) => !known.has(s))) {
    const { data: catRaw } = await admin.from('service_catalog').select('*')
    catalog = (catRaw ?? []) as ServiceCatalogItem[]
  }
  const isMorningChild = current.some((t) => t.active !== false && isMonthlyFlatEntry(t))

  const synced = therapiesSyncedToAgenda(current, counts, (service) =>
    catalogPrice(catalog, service, isMorningChild),
  )
  if (!synced.changed) return null

  // Monto esperado con el mismo criterio que generar y editar el ciclo:
  // subtotal − descuento. (El rollover en modo 'discount' se aplica en la
  // factura, no acá — ver createInvoiceForCycle.)
  const newAmount = expectedCycleAmount(
    synced.therapies.map((t) => ({
      service: t.service,
      sessions_per_month: Number(t.sessions_per_month ?? 0),
      unit_cost_usd: Number(t.unit_cost_usd ?? 0),
      billing_mode: t.billing_mode,
    })),
    {
      kind: (cycle.discount_kind ?? 'none') as DiscountKind,
      value: Number(cycle.discount_value ?? 0),
    },
  )

  const chargedBy = new Map(current.map((t) => [t.service, Number(t.sessions_per_month ?? 0)]))
  const lines: ChargeSyncLine[] = []
  for (const t of synced.therapies) {
    if (t.active === false || isMonthlyFlatEntry(t)) continue
    const charged = chargedBy.get(t.service) ?? 0
    const scheduled = Number(t.sessions_per_month ?? 0)
    if (charged !== scheduled) lines.push({ service: t.service, charged, scheduled })
  }

  return {
    cycleId: cycle.id,
    childId: cycle.child_id,
    periodMonth,
    paymentStatus: cycle.payment_status,
    currentAmount: Number(cycle.payment_amount_usd ?? 0),
    newAmount,
    lines,
    therapies: synced.therapies,
    snapshot,
    unpricedServices: synced.unpricedServices,
    hasInvoice: cycle.invoice_id != null,
  }
}

/** Escribe un plan ya calculado. Devuelve true si tocó el ciclo. */
async function applyChargeSyncPlan(admin: AdminClient, plan: ChargeSyncPlan): Promise<boolean> {
  const newSnapshot = { ...plan.snapshot, therapies_json: plan.therapies }

  if (plan.paymentStatus === 'paid') {
    // Ya pagado: no se re-cobra el mes. La diferencia contra lo que se congeló
    // al pagar viaja a la factura del mes siguiente.
    const { data: row } = await admin
      .from('monthly_session_cycles')
      .select('paid_expected_usd')
      .eq('id', plan.cycleId)
      .maybeSingle()
    const paidExpected = (row as { paid_expected_usd: number | null } | null)?.paid_expected_usd
    if (paidExpected == null) return false
    const adjustment = Math.round((plan.newAmount - Number(paidExpected)) * 100) / 100
    await admin
      .from('monthly_session_cycles')
      .update({ treatment_plan_snapshot: newSnapshot, billing_adjustment_usd: adjustment })
      .eq('id', plan.cycleId)
    return true
  }

  const { error } = await admin
    .from('monthly_session_cycles')
    .update({ treatment_plan_snapshot: newSnapshot, payment_amount_usd: plan.newAmount })
    .eq('id', plan.cycleId)
    .eq('payment_status', 'pending')
  if (error) {
    console.error(`[cycle-charge-sync] ${plan.cycleId}:`, error.message)
    return false
  }

  // Si ya había factura emitida, regenerarla con el detalle al día.
  if (plan.hasInvoice) {
    await createInvoiceForCycle(plan.cycleId).catch((e) => {
      console.error(`[cycle-charge-sync] re-factura ${plan.cycleId} falló:`, e)
    })
  }
  return true
}

/**
 * Re-sincroniza el cobro de los ciclos de `periodMonths` con la agenda real.
 * Nunca lanza: es un efecto secundario de agendar, y un fallo acá no debe
 * tumbar la creación de la cita (queda logueado y el PDF de detalle declara la
 * diferencia).
 *
 * @param childId       niño dueño de las citas
 * @param periodMonths  meses tocados ('YYYY-MM-01'); se deduplican
 */
export async function syncCycleChargeToAgenda(
  childId: string,
  periodMonths: string[],
): Promise<void> {
  const months = [...new Set(periodMonths.filter(Boolean))]
  if (months.length === 0) return

  try {
    const admin = createAdminClient()

    for (const periodMonth of months) {
      const { data: cycleRaw } = await admin
        .from('monthly_session_cycles')
        .select('*')
        .eq('child_id', childId)
        .eq('period_month', periodMonth)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (!cycleRaw) continue

      const plan = await buildChargeSyncPlan(admin, cycleRaw as MonthlySessionCycle)
      if (!plan) continue
      if (plan.unpricedServices.length > 0) {
        console.warn(
          `[cycle-charge-sync] ${childId} ${periodMonth}: sin precio de catálogo para ${plan.unpricedServices.join(', ')} — quedan agendadas sin cobrar.`,
        )
      }
      await applyChargeSyncPlan(admin, plan)
    }
  } catch (e) {
    console.error('[cycle-charge-sync] falló:', e)
  }
}

// ── Revisión por MES ────────────────────────────────────────────────────────
// Los ciclos generados antes de que existiera el sync (o con el bug de generar
// a mitad de mes) quedaron cobrando algo distinto a lo que tienen agendado.
// Esto los lista y los empareja en bloque.

export interface MonthChargeSyncRow {
  cycleId: string
  childName: string
  paymentStatus: 'pending' | 'paid'
  currentAmount: number
  newAmount: number
  lines: ChargeSyncLine[]
  hasInvoice: boolean
  unpricedServices: string[]
  /**
   * Niño en pausa temporal. Pausar NO cancela las citas ya agendadas, así que su
   * agenda suele tener sesiones que no se van a dar: emparejar le cobraría de
   * más. Primero hay que limpiar la agenda.
   */
  childPaused: boolean
}

async function requireMgmt(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!MGMT_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  return { ok: true }
}

async function collectMonthPlans(periodMonth: string): Promise<{
  plans: ChargeSyncPlan[]
  names: Map<string, string>
  paused: Set<string>
}> {
  const admin = createAdminClient()
  const { data: cyclesRaw } = await admin
    .from('monthly_session_cycles')
    .select('*')
    .eq('period_month', periodMonth)
    .eq('status', 'generated')

  const cycles = (cyclesRaw ?? []) as MonthlySessionCycle[]
  const names = new Map<string, string>()
  const paused = new Set<string>()
  if (cycles.length > 0) {
    const { data: kids } = await admin
      .from('children')
      .select('id, full_name, current_phase_code')
      .in('id', [...new Set(cycles.map((c) => c.child_id))])
    for (const k of (kids ?? []) as {
      id: string
      full_name: string
      current_phase_code: string | null
    }[]) {
      names.set(k.id, k.full_name)
      if (isChildPaused(k.current_phase_code)) paused.add(k.id)
    }
  }

  const plans: ChargeSyncPlan[] = []
  for (const cycle of cycles) {
    const plan = await buildChargeSyncPlan(admin, cycle)
    if (plan) plans.push(plan)
  }
  return { plans, names, paused }
}

/** Lista, SIN tocar nada, los ciclos del mes cuyo cobro no calza con la agenda. */
export async function previewMonthChargeSync(
  periodMonth: string,
): Promise<{ ok: true; rows: MonthChargeSyncRow[] } | { ok: false; error: string }> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const { plans, names, paused } = await collectMonthPlans(periodMonth)
    const rows: MonthChargeSyncRow[] = plans.map((p) => ({
      cycleId: p.cycleId,
      childName: names.get(p.childId) ?? 'Niño/a',
      paymentStatus: p.paymentStatus,
      currentAmount: p.currentAmount,
      newAmount: p.newAmount,
      lines: p.lines,
      hasInvoice: p.hasInvoice,
      unpricedServices: p.unpricedServices,
      childPaused: paused.has(p.childId),
    }))
    rows.sort((a, b) => a.childName.localeCompare(b.childName, 'es'))
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al revisar el mes.' }
  }
}

/**
 * Empareja el cobro con la agenda en los ciclos indicados (o en todos los del
 * mes que estén desalineados). Regenera la factura de los que ya la tenían.
 */
export async function applyMonthChargeSync(
  periodMonth: string,
  cycleIds?: string[],
): Promise<{ ok: true; applied: number; skipped: number } | { ok: false; error: string }> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const admin = createAdminClient()
    const { plans } = await collectMonthPlans(periodMonth)
    const wanted = cycleIds && cycleIds.length > 0 ? new Set(cycleIds) : null

    let applied = 0
    let skipped = 0
    for (const plan of plans) {
      if (wanted && !wanted.has(plan.cycleId)) continue
      const ok = await applyChargeSyncPlan(admin, plan)
      if (ok) applied++
      else skipped++
    }
    return { ok: true, applied, skipped }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al aplicar los cambios.' }
  }
}
