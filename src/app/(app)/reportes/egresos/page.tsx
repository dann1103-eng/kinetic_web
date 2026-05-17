import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listExpenses } from '@/app/actions/expenses'
import { getExpensesReport, fmtUsd } from '@/lib/domain/reports/expenses'
import { ExpensesTable } from '@/components/reportes/egresos/ExpensesTable'
import { DateRangeFilter } from '@/components/reportes/DateRangeFilter'
import { AccordionSection } from '@/components/ui/AccordionSection'
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type UserRole,
} from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable']

interface PageProps {
  searchParams: Promise<{
    from?: string
    to?: string
  }>
}

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now)
  fromDate.setMonth(fromDate.getMonth() - 5)
  fromDate.setDate(1)
  const from = fromDate.toISOString().slice(0, 10)
  return { from, to }
}

function parseDate(raw: string | undefined, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback
  return raw
}

export default async function EgresosPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const def = defaultRange()
  const fromDate = parseDate(params.from, def.from)
  const toDate = parseDate(params.to, def.to)

  const supabase = await createClient()
  const [report, expensesList] = await Promise.all([
    getExpensesReport(supabase, { fromDate, toDate }),
    listExpenses({ fromDate, toDate }),
  ])

  const { totals, rows, byCategory } = report
  const maxMonthTotal = Math.max(1, ...rows.map((r) => r.totalUsd))

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Egresos" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Reportes
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Egresos</span>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
              Egresos del centro
            </h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              Planillas (automáticas, costo patrono incluyendo aportes) más gastos generales
              registrados manualmente (renta, servicios, transporte, etc.).
            </p>
          </div>
          <DateRangeFilter
            paramFrom="from"
            paramTo="to"
            initialFrom={fromDate}
            initialTo={toDate}
          />
        </header>

        {/* KPIs principales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi
            label="Total egresos"
            value={fmtUsd(totals.total)}
            accent="#b31b25"
            hint={`${fromDate} → ${toDate}`}
          />
          <Kpi
            label="Costo de planilla"
            value={fmtUsd(totals.payrollCost)}
            accent="#1e293b"
            hint="Bruto + aportes patronales"
          />
          <Kpi
            label="Gastos generales"
            value={fmtUsd(totals.generalExpenses)}
            accent="#1e293b"
            hint="Renta, servicios, transporte, etc."
          />
        </div>

        {/* Tabla mensual con sparkbar */}
        <AccordionSection
          title="Desglose por mes"
          subtitle={`${rows.length} ${rows.length === 1 ? 'mes' : 'meses'} con egresos`}
          defaultOpen
        >
          {rows.length === 0 ? (
            <p className="text-sm text-fm-on-surface-variant py-4">
              Sin egresos en el rango. Registrá un gasto abajo o aplicá una planilla.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fm-surface-container-high">
                    <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Mes
                    </th>
                    <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Planilla
                    </th>
                    <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Gastos grales.
                    </th>
                    <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Total
                    </th>
                    <th className="py-2 pl-3 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const widthPct = (r.totalUsd / maxMonthTotal) * 100
                    return (
                      <tr
                        key={r.month}
                        className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
                      >
                        <td className="py-3 pr-4 font-semibold text-fm-on-surface">{r.monthLabel}</td>
                        <td className="py-3 px-3 text-right text-fm-on-surface tabular-nums">
                          {fmtUsd(r.payrollCostUsd)}
                        </td>
                        <td className="py-3 px-3 text-right text-fm-on-surface-variant tabular-nums">
                          {fmtUsd(r.generalExpensesUsd)}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-fm-on-surface tabular-nums">
                          {fmtUsd(r.totalUsd)}
                        </td>
                        <td className="py-3 pl-3">
                          <div className="w-full bg-fm-surface-container dark:bg-fm-surface-container-high rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${widthPct}%`, backgroundColor: '#b31b25' }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-fm-on-surface/40">
                    <td className="py-3 pr-4 font-extrabold text-fm-on-surface">Total período</td>
                    <td className="py-3 px-3 text-right font-extrabold text-fm-on-surface tabular-nums">
                      {fmtUsd(totals.payrollCost)}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-fm-on-surface tabular-nums">
                      {fmtUsd(totals.generalExpenses)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-lg" style={{ color: '#b31b25' }}>
                      {fmtUsd(totals.total)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </AccordionSection>

        {/* Distribución por categoría */}
        <AccordionSection
          title="Distribución por categoría"
          subtitle={`${byCategory.length} ${byCategory.length === 1 ? 'categoría' : 'categorías'} con egresos`}
        >
          {byCategory.length === 0 ? (
            <p className="text-sm text-fm-on-surface-variant py-4">Sin datos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fm-surface-container-high">
                    <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Categoría
                    </th>
                    <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      Total
                    </th>
                    <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                      % del total
                    </th>
                    <th className="py-2 pl-3 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((c) => {
                    const label = c.category === 'planillas'
                      ? 'Planillas'
                      : EXPENSE_CATEGORY_LABELS[c.category as ExpenseCategory] ?? c.category
                    return (
                      <tr
                        key={c.category}
                        className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
                      >
                        <td className="py-3 pr-4 font-semibold text-fm-on-surface">
                          {label}
                          {c.category === 'planillas' && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-fm-primary bg-fm-primary/10 px-1.5 py-0.5 rounded">
                              auto
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-fm-on-surface tabular-nums">
                          {fmtUsd(c.totalUsd)}
                        </td>
                        <td className="py-3 px-3 text-right text-fm-on-surface tabular-nums">
                          {(c.pct * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 pl-3">
                          <div className="w-full bg-fm-surface-container rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.max(1, c.pct * 100)}%`, backgroundColor: '#b31b25' }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AccordionSection>

        {/* Gestión de gastos */}
        <section>
          <ExpensesTable expenses={expensesList} />
        </section>

        <details className="text-xs text-fm-on-surface-variant px-2">
          <summary className="cursor-pointer hover:text-fm-on-surface">Notas del cálculo</summary>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>
              <strong>Costo de planilla</strong>: suma de <code>employer_cost_usd</code> de planillas
              en estado <code>sealed</code> o <code>paid</code> cuyo (period_year, period_month) cae
              en el rango. Incluye bruto + aportes patronales ISSS y AFP.
            </li>
            <li>
              <strong>Gastos generales</strong>: suma de <code>amount_usd</code> de
              <code> general_expenses</code> filtrados por <code>expense_date</code>.
            </li>
            <li>
              Las planillas <code>draft</code> NO cuentan (todavía editables). Las
              <code> cancelled</code> tampoco.
            </li>
          </ul>
        </details>
      </div>
    </div>
  )
}

function Kpi({ label, value, accent, hint }: { label: string; value: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-fm-background border border-fm-surface-container-high p-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </p>
      <p className="text-3xl font-black mt-2" style={{ color: accent }}>
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-fm-on-surface-variant mt-2 italic">{hint}</p>
      )}
    </div>
  )
}
