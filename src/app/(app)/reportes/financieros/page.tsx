import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import {
  getMonthlyRevenue,
  getAnnualComparison,
  getCycleStatusBreakdown,
  getPaymentMethodBreakdown,
} from '@/lib/domain/reports/financial'
import { MonthlyRevenueSection } from '@/components/reportes/MonthlyRevenueSection'
import { AnnualComparisonSection } from '@/components/reportes/AnnualComparisonSection'
import { CycleStatusSection } from '@/components/reportes/CycleStatusSection'
import { PaymentMethodSection } from '@/components/reportes/PaymentMethodSection'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

interface PageProps {
  searchParams: Promise<{
    year?: string
    annualYear?: string
    cyclesFrom?: string
    cyclesTo?: string
    pmFrom?: string
    pmTo?: string
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

function defaultCyclesRange(): { from: string; to: string } {
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
  const cyclesDef = defaultCyclesRange()
  const cyclesFrom = parseDate(params.cyclesFrom, cyclesDef.from)
  const cyclesTo = parseDate(params.cyclesTo, cyclesDef.to)
  const pmDef = defaultPmRange()
  const pmFrom = parseDate(params.pmFrom, pmDef.from)
  const pmTo = parseDate(params.pmTo, pmDef.to)

  const supabase = await createClient()

  const [monthlyRows, annualData, cyclesData, paymentMethodData] = await Promise.all([
    getMonthlyRevenue(supabase, { year }),
    getAnnualComparison(supabase, { year: annualYear }),
    getCycleStatusBreakdown(supabase, { fromDate: cyclesFrom, toDate: cyclesTo }),
    getPaymentMethodBreakdown(supabase, { fromDate: pmFrom, toDate: pmTo }),
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
            Ingresos, ciclos y métodos de pago. Datos basados en <code>monthly_session_cycles</code> agrupados por fecha de pago en zona SV.
          </p>
        </header>

        <div className="space-y-4">
          <MonthlyRevenueSection year={year} rows={monthlyRows} currentYear={systemYear} />
          <AnnualComparisonSection data={annualData} systemYear={systemYear} />
          <CycleStatusSection data={cyclesData} fromDate={cyclesFrom} toDate={cyclesTo} />
          <PaymentMethodSection
            rows={paymentMethodData.rows}
            totalUsd={paymentMethodData.totalUsd}
            totalCount={paymentMethodData.totalCount}
            fromDate={pmFrom}
            toDate={pmTo}
          />
        </div>
      </div>
    </div>
  )
}
