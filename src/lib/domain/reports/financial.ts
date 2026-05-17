/**
 * Reportería financiera Kinetic.
 *
 * 4 funciones puras de agregación sobre `monthly_session_cycles`:
 *   - getMonthlyRevenue(year)            — series mensual del año
 *   - getAnnualComparison(year)          — year-over-year mes a mes
 *   - getCycleStatusBreakdown(from, to)  — generados vs cancelados + motivos
 *   - getPaymentMethodBreakdown(from, to) — distribución por método
 *
 * Convención: agrupar por `paid_at` (no `period_month`), consistente con
 * `getRecepcionDashboardData` en global-dashboard.ts. Filtrar `status != 'cancelled'`
 * cuando se computan ingresos; contar `cancelled` aparte cuando sea relevante.
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
// 3. Ciclos generados vs cancelados + top motivos
// ──────────────────────────────────────────────────────────────────────────

export interface CycleStatusMonthRow {
  month: string              // YYYY-MM
  monthLabel: string         // "Ene 2026"
  generatedCount: number     // status != cancelled
  cancelledCount: number
  totalCount: number
  cancellationRate: number   // 0..1
}

export interface CycleCancelReasonRow {
  reason: string
  count: number
}

export interface CycleStatusBreakdown {
  rows: CycleStatusMonthRow[]
  totals: {
    generated: number
    cancelled: number
    total: number
    cancellationRate: number
  }
  topReasons: CycleCancelReasonRow[]
}

export async function getCycleStatusBreakdown(
  supabase: SupabaseClient<Database>,
  opts: { fromDate: string; toDate: string },
): Promise<CycleStatusBreakdown> {
  const { startISO, endISO } = dayRangeBoundsSV(opts.fromDate, opts.toDate)

  const { data } = await supabase
    .from('monthly_session_cycles')
    .select('paid_at, status, cancel_reason')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)

  const rows = (data ?? []) as Array<{
    paid_at: string
    status: MonthlySessionCycleStatus
    cancel_reason: string | null
  }>

  // Agrupar por mes (key YYYY-MM) en orden de aparición
  const byMonth = new Map<string, CycleStatusMonthRow>()
  let totalGenerated = 0
  let totalCancelled = 0
  const reasonCounts = new Map<string, number>()

  for (const r of rows) {
    const key = monthKeyInSV(r.paid_at)
    let row = byMonth.get(key)
    if (!row) {
      const [yStr, mStr] = key.split('-')
      const monthIdx = Number(mStr) - 1
      row = {
        month: key,
        monthLabel: `${MONTH_LABELS[monthIdx]} ${yStr}`,
        generatedCount: 0,
        cancelledCount: 0,
        totalCount: 0,
        cancellationRate: 0,
      }
      byMonth.set(key, row)
    }
    if (r.status === 'cancelled') {
      row.cancelledCount++
      totalCancelled++
      const reason = (r.cancel_reason ?? '').trim() || 'Sin motivo'
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    } else {
      row.generatedCount++
      totalGenerated++
    }
    row.totalCount++
  }

  for (const row of byMonth.values()) {
    row.cancellationRate = row.totalCount > 0 ? row.cancelledCount / row.totalCount : 0
  }

  const sortedRows = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
  const total = totalGenerated + totalCancelled

  const topReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    rows: sortedRows,
    totals: {
      generated: totalGenerated,
      cancelled: totalCancelled,
      total,
      cancellationRate: total > 0 ? totalCancelled / total : 0,
    },
    topReasons,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Métodos de pago
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
