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
import { catalogPriceFor } from '@/lib/domain/billing/catalog-price'
import {
  billableSessionCounts,
  needsChargeSync,
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
  /** Terapias cuyo precio venía en cero y se rellenó del catálogo. */
  backfilledPrices: { service: string; unitCost: number }[]
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

  // select('*') a propósito: nombrar `suspension_id` haría fallar la consulta
  // entera si la migración 0184 todavía no se aplicó en ese ambiente.
  const { data: apptsRaw } = await admin
    .from('appointments')
    .select('*')
    .eq('child_id', cycle.child_id)
    .eq('event_type', 'terapia')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)

  // Sin citas de terapia individual el mapa queda vacío, pero NO se corta acá: un
  // niño de solo programa matutino igual puede tener el precio de su mensualidad
  // en cero en el snapshot, y ese respaldo hay que hacerlo. `therapiesSyncedToAgenda`
  // decide si hay algo que cambiar.
  const counts = billableSessionCounts((apptsRaw ?? []) as ChargeableAppt[])

  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
    [k: string]: unknown
  }
  const current = snapshot.therapies_json ?? []
  if (current.length === 0) return null

  // El catálogo se carga SIEMPRE: además de precios para servicios fuera del
  // plan, es el respaldo de las terapias del snapshot que vienen sin precio.
  const { data: catRaw } = await admin.from('service_catalog').select('*')
  const catalog = (catRaw ?? []) as ServiceCatalogItem[]
  const isMorningChild = current.some((t) => t.active !== false && isMonthlyFlatEntry(t))
  const daysPerWeekBy = new Map<string, number | null>(
    current.map((t) => [t.service, t.days_per_week ?? null]),
  )

  const synced = therapiesSyncedToAgenda(current, counts, (service) =>
    catalogPriceFor(catalog, service, {
      isMorningChild,
      daysPerWeek: daysPerWeekBy.get(service),
    }),
  )

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

  // GUARD: nunca dejar un ciclo en cero si hoy cobra algo. Pasó en prod — los
  // snapshots sin precio recalculaban a $0 y el monto real se perdía. Si el
  // catálogo tampoco tiene precio, se reporta y NO se toca el ciclo.
  const currentAmount = Number(cycle.payment_amount_usd ?? 0)
  if (newAmount <= 0 && currentAmount > 0) {
    console.error(
      `[cycle-charge-sync] ${cycle.id}: el recálculo da $0 y el ciclo cobra $${currentAmount}. Sin precio de catálogo para ${synced.unpricedServices.join(', ') || 'las terapias del snapshot'}. Se deja como está.`,
    )
    return null
  }

  // Se revisa el desfase contra la agenda Y el del monto registrado: un ciclo
  // cuyo detalle ya cuadra con la agenda pero que quedó con un
  // `payment_amount_usd` viejo también hay que emparejarlo. Antes se cortaba
  // acá con `!synced.changed` y ese caso era invisible para la revisión.
  if (!needsChargeSync({ therapiesChanged: synced.changed, currentAmount, newAmount })) {
    return null
  }

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
    currentAmount,
    newAmount,
    lines,
    therapies: synced.therapies,
    snapshot,
    unpricedServices: synced.unpricedServices,
    backfilledPrices: synced.backfilledPrices,
    hasInvoice: cycle.invoice_id != null,
  }
}

/**
 * Qué hacer con un ciclo YA PAGADO cuyo detalle se corrigió.
 *
 *  - `carry`           — la familia pagó el monto viejo. El mes no se re-cobra y
 *                        la diferencia viaja a la mensualidad siguiente.
 *  - `already_correct` — la familia ya pagó el monto correcto (recepción cobró
 *                        bien aunque el sistema tuviera otro número). No hay nada
 *                        que arrastrar: se corrige el registro del ciclo.
 *
 * El sistema NO puede deducir cuál es: depende de cuánto se recibió en caja.
 */
export type PaidCycleMode = 'carry' | 'already_correct'

/** Escribe un plan ya calculado. Devuelve true si tocó el ciclo. */
async function applyChargeSyncPlan(
  admin: AdminClient,
  plan: ChargeSyncPlan,
  paidMode: PaidCycleMode = 'carry',
): Promise<boolean> {
  const newSnapshot = { ...plan.snapshot, therapies_json: plan.therapies }

  if (plan.paymentStatus === 'paid') {
    if (paidMode === 'already_correct') {
      // Lo cobrado fue lo correcto: se alinea el registro del ciclo y no queda
      // ningún arrastre. `paid_expected_usd` es la base de futuros ajustes, así
      // que también se mueve.
      await admin
        .from('monthly_session_cycles')
        .update({
          treatment_plan_snapshot: newSnapshot,
          payment_amount_usd: plan.newAmount,
          paid_expected_usd: plan.newAmount,
          billing_adjustment_usd: 0,
        })
        .eq('id', plan.cycleId)
      return true
    }

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
  backfilledPrices: { service: string; unitCost: number }[]
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
      backfilledPrices: p.backfilledPrices,
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
  selections?: { cycleId: string; paidMode?: PaidCycleMode }[],
): Promise<{ ok: true; applied: number; skipped: number } | { ok: false; error: string }> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const admin = createAdminClient()
    const { plans } = await collectMonthPlans(periodMonth)
    const wanted =
      selections && selections.length > 0
        ? new Map(selections.map((s) => [s.cycleId, s.paidMode ?? 'carry']))
        : null

    let applied = 0
    let skipped = 0
    for (const plan of plans) {
      if (wanted && !wanted.has(plan.cycleId)) continue
      const ok = await applyChargeSyncPlan(admin, plan, wanted?.get(plan.cycleId) ?? 'carry')
      if (ok) applied++
      else skipped++
    }
    return { ok: true, applied, skipped }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al aplicar los cambios.' }
  }
}

// ── Ajustes que quedaron pendientes de arrastrar ────────────────────────────
// Un ciclo pagado que se corrigió arrastra la diferencia al mes siguiente. Si la
// familia en realidad ya había pagado el monto correcto, ese arrastre es un error
// y hay que quitarlo — pero el ciclo ya no aparece en la revisión (su detalle ya
// coincide con la agenda), así que necesita su propia lista.

export interface PendingAdjustmentRow {
  cycleId: string
  childName: string
  /** Monto que el ciclo tiene registrado como cobrado. */
  recordedAmount: number
  /** Costo real del mes según el detalle actual. */
  detailAmount: number
  /** Positivo = se le va a cobrar de más el mes siguiente; negativo = crédito. */
  adjustment: number
}

/** Costo del mes según el snapshot: mensualidad fija = 1 × precio, resto sesiones × precio. */
function snapshotAmount(cycle: MonthlySessionCycle): number {
  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
  }
  return expectedCycleAmount(
    (snapshot.therapies_json ?? [])
      .filter((t) => t.active !== false)
      .map((t) => ({
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
}

/** Ciclos pagados del mes con un ajuste todavía sin arrastrar a la factura siguiente. */
export async function listPendingAdjustments(
  periodMonth: string,
): Promise<{ ok: true; rows: PendingAdjustmentRow[] } | { ok: false; error: string }> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const admin = createAdminClient()
    const { data: raw } = await admin
      .from('monthly_session_cycles')
      .select('*')
      .eq('period_month', periodMonth)
      .eq('status', 'generated')
      .eq('payment_status', 'paid')
      .neq('billing_adjustment_usd', 0)
      .is('billing_adjustment_carried_at', null)

    const cycles = (raw ?? []) as MonthlySessionCycle[]
    if (cycles.length === 0) return { ok: true, rows: [] }

    const { data: kids } = await admin
      .from('children')
      .select('id, full_name')
      .in('id', [...new Set(cycles.map((c) => c.child_id))])
    const names = new Map(
      ((kids ?? []) as { id: string; full_name: string }[]).map((k) => [k.id, k.full_name]),
    )

    const rows = cycles.map((c) => ({
      cycleId: c.id,
      childName: names.get(c.child_id) ?? 'Niño/a',
      recordedAmount: Number(c.payment_amount_usd ?? 0),
      detailAmount: snapshotAmount(c),
      adjustment: Number(c.billing_adjustment_usd ?? 0),
    }))
    rows.sort((a, b) => a.childName.localeCompare(b.childName, 'es'))
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al listar los ajustes.' }
  }
}

/**
 * Quita el arrastre de un ciclo pagado: la familia ya había pagado el monto
 * correcto, así que se alinea el registro del ciclo y no queda nada pendiente
 * para el mes siguiente.
 */
export async function clearCycleAdjustment(
  cycleId: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const admin = createAdminClient()
    const { data: raw } = await admin
      .from('monthly_session_cycles')
      .select('*')
      .eq('id', cycleId)
      .maybeSingle()
    if (!raw) return { ok: false, error: 'Ciclo no encontrado.' }
    const cycle = raw as MonthlySessionCycle
    const amount = snapshotAmount(cycle)

    const { error } = await admin
      .from('monthly_session_cycles')
      .update({
        payment_amount_usd: amount,
        paid_expected_usd: amount,
        billing_adjustment_usd: 0,
      })
      .eq('id', cycleId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, amount }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al quitar el ajuste.' }
  }
}
