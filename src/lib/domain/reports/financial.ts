/**
 * Reportería financiera Kinetic.
 *
 * Funciones puras de agregación sobre `monthly_session_cycles` y `children`:
 *   - getMonthlyRevenue(year)            — series mensual del año
 *   - getAnnualComparison(year)          — year-over-year mes a mes
 *   - getPaymentMethodBreakdown(from, to) — distribución por método de pago
 *   - getChurnBreakdown(from, to)         — flujo de altas/bajas/pausas por mes
 *
 * Convención: agrupar por `paid_at` (no `period_month`), consistente con
 * `getRecepcionDashboardData` en global-dashboard.ts. Filtrar `status != 'cancelled'`
 * cuando se computan ingresos.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MonthlySessionCycleStatus } from '@/types/db'

const TZ = 'America/El_Salvador'

const MONTH_LABELS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/** Devuelve el rango ISO [start, end) que cubre un año entero en SV. */
export function yearBoundsSV(year: number): { startISO: string; endISO: string } {
  const start = fromZonedTime(new Date(year, 0, 1, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(year + 1, 0, 1, 0, 0, 0), TZ)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

/** Devuelve el rango ISO [start, end) que cubre un día (00:00 SV → +1 día). */
export function dayRangeBoundsSV(fromDate: string, toDate: string): {
  startISO: string
  endISO: string
} {
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const [ty, tm, td] = toDate.split('-').map(Number)
  const start = fromZonedTime(new Date(fy, fm - 1, fd, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(ty, tm - 1, td + 1, 0, 0, 0), TZ)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

function monthIndexInSV(isoUtc: string): number {
  return toZonedTime(new Date(isoUtc), TZ).getMonth()
}

function yearInSV(isoUtc: string): number {
  return toZonedTime(new Date(isoUtc), TZ).getFullYear()
}

function monthKeyInSV(isoUtc: string): string {
  const d = toZonedTime(new Date(isoUtc), TZ)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Ingresos mensuales (un año)
// ──────────────────────────────────────────────────────────────────────────

export interface MonthlyRevenueRow {
  month: string              // YYYY-MM
  monthLabel: string         // "Ene 2026"
  monthShort: string         // "Ene"
  generatedCount: number
  cancelledCount: number
  netRevenueUsd: number
  discountAppliedCount: number
  uniqueChildrenPaid: number
}

export async function getMonthlyRevenue(
  supabase: SupabaseClient<Database>,
  opts: { year: number },
): Promise<MonthlyRevenueRow[]> {
  const { startISO, endISO } = yearBoundsSV(opts.year)

  const { data } = await supabase
    .from('monthly_session_cycles')
    .select('paid_at, payment_amount_usd, status, discount_kind, child_id')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)

  const rows = (data ?? []) as Array<{
    paid_at: string
    payment_amount_usd: number | null
    status: MonthlySessionCycleStatus
    discount_kind: 'none' | 'percent' | 'fixed' | null
    child_id: string
  }>

  // 12 filas con ceros, una por mes
  const acc: MonthlyRevenueRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${opts.year}-${String(i + 1).padStart(2, '0')}`,
    monthLabel: `${MONTH_LABELS[i]} ${opts.year}`,
    monthShort: MONTH_LABELS[i],
    generatedCount: 0,
    cancelledCount: 0,
    netRevenueUsd: 0,
    discountAppliedCount: 0,
    uniqueChildrenPaid: 0,
  }))

  const uniqueChildrenByMonth: Set<string>[] = Array.from({ length: 12 }, () => new Set())

  for (const r of rows) {
    const idx = monthIndexInSV(r.paid_at)
    if (idx < 0 || idx > 11) continue
    if (r.status === 'cancelled') {
      acc[idx].cancelledCount++
    } else {
      acc[idx].generatedCount++
      acc[idx].netRevenueUsd += Number(r.payment_amount_usd ?? 0)
      if (r.discount_kind && r.discount_kind !== 'none') {
        acc[idx].discountAppliedCount++
      }
      uniqueChildrenByMonth[idx].add(r.child_id)
    }
  }

  for (let i = 0; i < 12; i++) {
    acc[i].uniqueChildrenPaid = uniqueChildrenByMonth[i].size
  }

  return acc
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Comparativa anual (year-over-year)
// ──────────────────────────────────────────────────────────────────────────

export interface AnnualComparisonRow {
  month: number              // 0..11
  monthShort: string         // "Ene"
  currentYearRevenue: number
  previousYearRevenue: number
  currentYearCycles: number
  previousYearCycles: number
  /** Diferencia absoluta en USD (current - previous). */
  deltaUsd: number
  /** Diferencia porcentual; null si previousYearRevenue es 0. */
  deltaPct: number | null
}

export async function getAnnualComparison(
  supabase: SupabaseClient<Database>,
  opts: { year: number },
): Promise<{
  rows: AnnualComparisonRow[]
  currentYear: number
  previousYear: number
  totals: { current: number; previous: number; deltaUsd: number; deltaPct: number | null }
}> {
  const previousYear = opts.year - 1
  const { startISO } = yearBoundsSV(previousYear)
  const { endISO } = yearBoundsSV(opts.year)

  const { data } = await supabase
    .from('monthly_session_cycles')
    .select('paid_at, payment_amount_usd, status')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)
    .neq('status', 'cancelled')

  const rows = (data ?? []) as Array<{
    paid_at: string
    payment_amount_usd: number | null
    status: MonthlySessionCycleStatus
  }>

  const result: AnnualComparisonRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    monthShort: MONTH_LABELS[i],
    currentYearRevenue: 0,
    previousYearRevenue: 0,
    currentYearCycles: 0,
    previousYearCycles: 0,
    deltaUsd: 0,
    deltaPct: null,
  }))

  for (const r of rows) {
    const idx = monthIndexInSV(r.paid_at)
    if (idx < 0 || idx > 11) continue
    const year = yearInSV(r.paid_at)
    const amount = Number(r.payment_amount_usd ?? 0)
    if (year === opts.year) {
      result[idx].currentYearRevenue += amount
      result[idx].currentYearCycles++
    } else if (year === previousYear) {
      result[idx].previousYearRevenue += amount
      result[idx].previousYearCycles++
    }
  }

  for (const row of result) {
    row.deltaUsd = row.currentYearRevenue - row.previousYearRevenue
    row.deltaPct = row.previousYearRevenue > 0
      ? (row.deltaUsd / row.previousYearRevenue) * 100
      : null
  }

  const totalCurrent = result.reduce((s, r) => s + r.currentYearRevenue, 0)
  const totalPrevious = result.reduce((s, r) => s + r.previousYearRevenue, 0)

  return {
    rows: result,
    currentYear: opts.year,
    previousYear,
    totals: {
      current: totalCurrent,
      previous: totalPrevious,
      deltaUsd: totalCurrent - totalPrevious,
      deltaPct: totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : null,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Métodos de pago
// ──────────────────────────────────────────────────────────────────────────

export interface PaymentMethodRow {
  method: string             // "efectivo", "transferencia", etc. — o "Sin especificar"
  count: number
  totalUsd: number
  pct: number                // 0..1 sobre totalUsd global
}

export async function getPaymentMethodBreakdown(
  supabase: SupabaseClient<Database>,
  opts: { fromDate: string; toDate: string },
): Promise<{ rows: PaymentMethodRow[]; totalUsd: number; totalCount: number }> {
  const { startISO, endISO } = dayRangeBoundsSV(opts.fromDate, opts.toDate)

  const { data } = await supabase
    .from('monthly_session_cycles')
    .select('payment_method, payment_amount_usd, status')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)
    .neq('status', 'cancelled')

  const rows = (data ?? []) as Array<{
    payment_method: string | null
    payment_amount_usd: number | null
    status: MonthlySessionCycleStatus
  }>

  const byMethod = new Map<string, { count: number; totalUsd: number }>()
  let totalUsd = 0
  let totalCount = 0

  for (const r of rows) {
    const method = (r.payment_method ?? '').trim() || 'Sin especificar'
    const amount = Number(r.payment_amount_usd ?? 0)
    const entry = byMethod.get(method) ?? { count: 0, totalUsd: 0 }
    entry.count++
    entry.totalUsd += amount
    byMethod.set(method, entry)
    totalUsd += amount
    totalCount++
  }

  const result: PaymentMethodRow[] = Array.from(byMethod.entries())
    .map(([method, entry]) => ({
      method,
      count: entry.count,
      totalUsd: entry.totalUsd,
      pct: totalUsd > 0 ? entry.totalUsd / totalUsd : 0,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  return { rows: result, totalUsd, totalCount }
}

// ──────────────────────────────────────────────────────────────────────────
// Churn de familias / niños (basado en child_phase_history)
// ──────────────────────────────────────────────────────────────────────────
// Mide flujo neto a partir de las transiciones del pipeline (mig 0121):
//   - newActives: transiciones a `3_3_activo_en_terapias`
//   - medicalDischarges: transiciones a `5_1_alta_terapeutica`
//   - dropouts: transiciones a `5_2_retirado`
//   - paused: transiciones a `4_1_pausa_temporal` o `4_2_seguimiento_pendiente`

const PHASE_NEW_ACTIVE = '3_3_activo_en_terapias'
const PHASE_MEDICAL_DISCHARGE = '5_1_alta_terapeutica'
const PHASE_DROPPED = '5_2_retirado'
const PHASES_PAUSED = new Set(['4_1_pausa_temporal', '4_2_seguimiento_pendiente'])

export interface ChurnMonthRow {
  month: string                  // YYYY-MM
  monthLabel: string             // "Ene 2026"
  newActives: number             // niños que pasaron a 'active' este mes
  medicalDischarges: number      // alta médica (positivo)
  dropouts: number               // baja por abandono (negativo)
  paused: number                 // pausados o considerando alta
  netChange: number              // newActives − (medicalDischarges + dropouts)
}

export interface ChurnBreakdown {
  rows: ChurnMonthRow[]
  totals: {
    newActives: number
    medicalDischarges: number
    dropouts: number
    paused: number
    netChange: number
  }
  /** % de bajas sobre el total de salidas (bajas / (bajas + altas médicas)). */
  abandonRatePct: number
}

export async function getChurnBreakdown(
  supabase: SupabaseClient<Database>,
  opts: { fromDate: string; toDate: string },
): Promise<ChurnBreakdown> {
  const { startISO, endISO } = dayRangeBoundsSV(opts.fromDate, opts.toDate)

  const { data } = await supabase
    .from('child_phase_history')
    .select('to_phase_code, changed_at')
    .not('child_id', 'is', null)
    .gte('changed_at', startISO)
    .lt('changed_at', endISO)

  const rows = (data ?? []) as Array<{
    to_phase_code: string
    changed_at: string
  }>

  // Agrupar por mes
  const byMonth = new Map<string, ChurnMonthRow>()
  let totalNewActives = 0
  let totalMedical = 0
  let totalDropouts = 0
  let totalPaused = 0

  for (const r of rows) {
    const key = monthKeyInSV(r.changed_at)
    let row = byMonth.get(key)
    if (!row) {
      const [yStr, mStr] = key.split('-')
      const monthIdx = Number(mStr) - 1
      row = {
        month: key,
        monthLabel: `${MONTH_LABELS[monthIdx]} ${yStr}`,
        newActives: 0,
        medicalDischarges: 0,
        dropouts: 0,
        paused: 0,
        netChange: 0,
      }
      byMonth.set(key, row)
    }

    if (r.to_phase_code === PHASE_NEW_ACTIVE) {
      row.newActives++
      totalNewActives++
    } else if (r.to_phase_code === PHASE_MEDICAL_DISCHARGE) {
      row.medicalDischarges++
      totalMedical++
    } else if (r.to_phase_code === PHASE_DROPPED) {
      row.dropouts++
      totalDropouts++
    } else if (PHASES_PAUSED.has(r.to_phase_code)) {
      row.paused++
      totalPaused++
    }
  }

  for (const row of byMonth.values()) {
    row.netChange = row.newActives - (row.medicalDischarges + row.dropouts)
  }

  const sorted = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
  const totalExits = totalMedical + totalDropouts
  const abandonRatePct = totalExits > 0
    ? Math.round((totalDropouts / totalExits) * 1000) / 10
    : 0

  return {
    rows: sorted,
    totals: {
      newActives: totalNewActives,
      medicalDischarges: totalMedical,
      dropouts: totalDropouts,
      paused: totalPaused,
      netChange: totalNewActives - (totalMedical + totalDropouts),
    },
    abandonRatePct,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers de formato (compartidos UI + PDF)
// ──────────────────────────────────────────────────────────────────────────

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatPercent(n: number, fractionDigits = 1): string {
  return `${(n * 100).toFixed(fractionDigits)}%`
}

export function formatPaymentMethodLabel(raw: string): string {
  if (raw === 'Sin especificar') return raw
  // Capitaliza primer carácter
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
