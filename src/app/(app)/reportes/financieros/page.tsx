import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import {
  getMonthlyRevenue,
  getAnnualComparison,
  getPaymentMethodBreakdown,
  getChurnBreakdown,
} from '@/lib/domain/reports/financial'
import { MonthlyRevenueSection } from '@/components/reportes/MonthlyRevenueSection'
import { AnnualComparisonSection } from '@/components/reportes/AnnualComparisonSection'
import { PaymentMethodSection } from '@/components/reportes/PaymentMethodSection'
import { ChurnSection } from '@/components/reportes/ChurnSection'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

interface PageProps {
  searchParams: Promise<{
    year?: string
    annualYear?: string
    pmFrom?: string
    pmTo?: string
    churnFrom?: string
    churnTo?: string
  }>
}

function parseYear(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 2000 || n > 2100) return fallback
  return n
}

function parseDate(raw: string | undefined, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback
  return raw
}

function default12mRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now)
  fromDate.setMonth(fromDate.getMonth() - 11)
  fromDate.setDate(1)
  const from = fromDate.toISOString().slice(0, 10)
  return { from, to }
}

function defaultPmRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  return { from: `${year}-01-01`, to: now.toISOString().slice(0, 10) }
}

export default async function ReportesFinancierosPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const systemYear = new Date().getFullYear()

  const year = parseYear(params.year, systemYear)
  const annualYear = parseYear(params.annualYear, systemYear)
  const range12m = default12mRange()
  const pmDef = defaultPmRange()
  const pmFrom = parseDate(params.pmFrom, pmDef.from)
  const pmTo = parseDate(params.pmTo, pmDef.to)
  // Churn usa últimos 12 meses por default.
  const churnFrom = parseDate(params.churnFrom, range12m.from)
  const churnTo = parseDate(params.churnTo, range12m.to)

  const supabase = await createClient()

  const [monthlyRows, annualData, paymentMethodData, churnData] = await Promise.all([
    getMonthlyRevenue(supabase, { year }),
    getAnnualComparison(supabase, { year: annualYear }),
    getPaymentMethodBreakdown(supabase, { fromDate: pmFrom, toDate: pmTo }),
    getChurnBreakdown(supabase, { fromDate: churnFrom, toDate: churnTo }),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Reportes financieros" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              arrow_back
            </span>
            Reportes
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Financieros</span>
        </div>

        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Reportes financieros
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Ingresos, ciclos, métodos de pago y churn de familias. Datos basados en{' '}
            <code>monthly_session_cycles</code> y <code>children.treatment_status</code> en zona SV.
          </p>
        </header>

        <div className="space-y-4">
          <MonthlyRevenueSection year={year} rows={monthlyRows} currentYear={systemYear} />
          <AnnualComparisonSection data={annualData} systemYear={systemYear} />
          <PaymentMethodSection
            rows={paymentMethodData.rows}
            totalUsd={paymentMethodData.totalUsd}
            totalCount={paymentMethodData.totalCount}
            fromDate={pmFrom}
            toDate={pmTo}
          />
          <ChurnSection data={churnData} fromDate={churnFrom} toDate={churnTo} />
        </div>
      </div>
    </div>
  )
}
