/**
 * Reportería de egresos Kinetic.
 *
 * Combina dos fuentes:
 *   1. Costo de planilla = sum(payroll_items.employer_cost_usd) de
 *      payroll_runs en estado sealed/paid del mes (period_year, period_month).
 *      Esto incluye bruto + aportes patronales ISSS + AFP (costo real al patrono).
 *   2. Gastos generales = sum(general_expenses.amount_usd) por expense_date.
 */

import { toZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ExpenseCategory } from '@/types/db'

const TZ = 'America/El_Salvador'

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function monthKeyFromDate(date: string): string {
  // expense_date es YYYY-MM-DD; el month key es YYYY-MM
  return date.slice(0, 7)
}

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-')
  const idx = Number(m) - 1
  return `${MONTH_LABELS[idx]} ${y}`
}

function monthKeyFromYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// ──────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────

export interface ExpenseMonthRow {
  month: string                // YYYY-MM
  monthLabel: string           // "Enero 2026"
  payrollCostUsd: number       // suma de employer_cost_usd de planillas del mes
  generalExpensesUsd: number   // suma de amount_usd de gastos generales con expense_date en el mes
  totalUsd: number
}

export interface ExpenseCategoryRow {
  /** 'planillas' es un cubo agregado; los demás son ExpenseCategory válidas. */
  category: ExpenseCategory | 'planillas'
  totalUsd: number
  count: number
  pct: number                  // 0..1 sobre el total de egresos
}

export interface ExpensesReport {
  fromDate: string
  toDate: string
  rows: ExpenseMonthRow[]
  totals: {
    payrollCost: number
    generalExpenses: number
    total: number
  }
  byCategory: ExpenseCategoryRow[]
}

// ──────────────────────────────────────────────────────────────────────────
// Función principal
// ──────────────────────────────────────────────────────────────────────────

export async function getExpensesReport(
  supabase: SupabaseClient<Database>,
  opts: { fromDate: string; toDate: string },
): Promise<ExpensesReport> {
  // 1. Gastos generales en rango (filtra por expense_date)
  const { data: expensesRaw } = await supabase
    .from('general_expenses')
    .select('category, amount_usd, expense_date')
    .gte('expense_date', opts.fromDate)
    .lte('expense_date', opts.toDate)
  const expenses = (expensesRaw ?? []) as Array<{
    category: ExpenseCategory
    amount_usd: number
    expense_date: string
  }>

  // 2. Planillas selladas/pagadas dentro del rango (matcheamos por period_year × period_month
  //    contra el rango YYYY-MM derivado del fromDate/toDate).
  const fromKey = opts.fromDate.slice(0, 7)
  const toKey = opts.toDate.slice(0, 7)
  const { data: runsRaw } = await supabase
    .from('payroll_runs')
    .select('id, period_year, period_month, status')
    .in('status', ['sealed', 'paid'])
  const runs = (runsRaw ?? []) as Array<{
    id: string
    period_year: number
    period_month: number
    status: string
  }>
  const runsInRange = runs.filter((r) => {
    const k = monthKeyFromYM(r.period_year, r.period_month)
    return k >= fromKey && k <= toKey
  })

  // 3. employer_cost por planilla en rango
  let payrollItems: Array<{ payroll_run_id: string; employer_cost_usd: number }> = []
  if (runsInRange.length > 0) {
    const { data: itemsRaw } = await supabase
      .from('payroll_items')
      .select('payroll_run_id, employer_cost_usd')
      .in('payroll_run_id', runsInRange.map((r) => r.id))
    payrollItems = (itemsRaw ?? []) as typeof payrollItems
  }
  const runById = new Map(runsInRange.map((r) => [r.id, r]))

  // Agrupar por mes
  const byMonth = new Map<string, ExpenseMonthRow>()
  const ensureMonth = (key: string): ExpenseMonthRow => {
    let row = byMonth.get(key)
    if (!row) {
      row = {
        month: key,
        monthLabel: monthLabelFromKey(key),
        payrollCostUsd: 0,
        generalExpensesUsd: 0,
        totalUsd: 0,
      }
      byMonth.set(key, row)
    }
    return row
  }

  // Acumular planillas por mes
  for (const it of payrollItems) {
    const run = runById.get(it.payroll_run_id)
    if (!run) continue
    const key = monthKeyFromYM(run.period_year, run.period_month)
    const row = ensureMonth(key)
    row.payrollCostUsd += Number(it.employer_cost_usd ?? 0)
  }

  // Acumular gastos generales por mes
  const byCategoryMap = new Map<ExpenseCategory | 'planillas', { total: number; count: number }>()
  for (const e of expenses) {
    const key = monthKeyFromDate(e.expense_date)
    const row = ensureMonth(key)
    const amount = Number(e.amount_usd ?? 0)
    row.generalExpensesUsd += amount
    const catEntry = byCategoryMap.get(e.category) ?? { total: 0, count: 0 }
    catEntry.total += amount
    catEntry.count++
    byCategoryMap.set(e.category, catEntry)
  }

  // Total por mes
  for (const row of byMonth.values()) {
    row.totalUsd = row.payrollCostUsd + row.generalExpensesUsd
  }

  const sortedRows = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))

  // Totales generales
  const totalPayroll = sortedRows.reduce((s, r) => s + r.payrollCostUsd, 0)
  const totalGeneral = sortedRows.reduce((s, r) => s + r.generalExpensesUsd, 0)
  const grandTotal = totalPayroll + totalGeneral

  // Agregar planillas como categoría sintética
  if (totalPayroll > 0) {
    byCategoryMap.set('planillas', { total: totalPayroll, count: payrollItems.length })
  }

  const byCategory: ExpenseCategoryRow[] = Array.from(byCategoryMap.entries())
    .map(([category, entry]) => ({
      category,
      totalUsd: entry.total,
      count: entry.count,
      pct: grandTotal > 0 ? entry.total / grandTotal : 0,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  return {
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    rows: sortedRows,
    totals: {
      payrollCost: totalPayroll,
      generalExpenses: totalGeneral,
      total: grandTotal,
    },
    byCategory,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Mes actual (para dashboard widget)
// ──────────────────────────────────────────────────────────────────────────

export interface CurrentMonthExpenseSummary {
  monthLabel: string
  payrollCostUsd: number
  generalExpensesUsd: number
  totalUsd: number
  /** Serie diaria de gasto general acumulado (no incluye planilla). Para sparkline. */
  generalByDay: { day: number; amountUsd: number }[]
}

export async function getCurrentMonthExpenseSummary(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<CurrentMonthExpenseSummary> {
  const local = toZonedTime(now, TZ)
  const year = local.getFullYear()
  const month = local.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()

  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  // Gastos generales del mes
  const { data: expensesRaw } = await supabase
    .from('general_expenses')
    .select('amount_usd, expense_date')
    .gte('expense_date', fromDate)
    .lte('expense_date', toDate)
  const expenses = (expensesRaw ?? []) as Array<{ amount_usd: number; expense_date: string }>

  const byDay = new Map<number, number>()
  let generalTotal = 0
  for (const e of expenses) {
    const day = Number(e.expense_date.slice(8, 10))
    const amount = Number(e.amount_usd ?? 0)
    byDay.set(day, (byDay.get(day) ?? 0) + amount)
    generalTotal += amount
  }

  // Planilla del mes (employer_cost) — busca payroll_run que matchee period_year/month
  const { data: runRow } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('period_year', year)
    .eq('period_month', month)
    .in('status', ['sealed', 'paid'])
    .maybeSingle()

  let payrollCost = 0
  if (runRow) {
    const { data: itemsRaw } = await supabase
      .from('payroll_items')
      .select('employer_cost_usd')
      .eq('payroll_run_id', runRow.id)
    payrollCost = ((itemsRaw ?? []) as Array<{ employer_cost_usd: number }>).reduce(
      (s, r) => s + Number(r.employer_cost_usd ?? 0),
      0,
    )
  }

  const generalByDay: { day: number; amountUsd: number }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    generalByDay.push({ day: d, amountUsd: byDay.get(d) ?? 0 })
  }

  return {
    monthLabel: `${MONTH_LABELS[month - 1]} ${year}`,
    payrollCostUsd: payrollCost,
    generalExpensesUsd: generalTotal,
    totalUsd: payrollCost + generalTotal,
    generalByDay,
  }
}

// ── Helpers de formato ────────────────────────────────────────────────────

export function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
