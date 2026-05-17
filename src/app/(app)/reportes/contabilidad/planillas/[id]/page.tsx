import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { getPayrollRunDetail } from '@/app/actions/payroll'
import { fmtUsd, formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import { PayrollItemEditor } from '@/components/reportes/contabilidad/PayrollItemEditor'
import { PayrollRunActions } from '@/components/reportes/contabilidad/PayrollRunActions'
import { ReportDownloadButton } from '@/components/reportes/ReportDownloadButton'
import { PAYROLL_RUN_STATUS_LABELS, type UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable']

const STATUS_TONES: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'bg-amber-100',  text: 'text-amber-900' },
  sealed:    { bg: 'bg-sky-100',    text: 'text-sky-900' },
  paid:      { bg: 'bg-emerald-100',text: 'text-emerald-900' },
  cancelled: { bg: 'bg-slate-200',  text: 'text-slate-700' },
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PayrollRunDetailPage({ params }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { id } = await params
  const detail = await getPayrollRunDetail(id)
  if (!detail) notFound()

  const { run, items } = detail
  const editable = run.status === 'draft'
  const tone = STATUS_TONES[run.status]

  const totals = items.reduce(
    (acc, it) => ({
      gross: acc.gross + Number(it.gross_total_usd),
      isssEmp: acc.isssEmp + Number(it.isss_employee_usd),
      afpEmp: acc.afpEmp + Number(it.afp_employee_usd),
      isr: acc.isr + Number(it.isr_usd),
      net: acc.net + Number(it.net_pay_usd),
      isssPat: acc.isssPat + Number(it.isss_employer_usd),
      afpPat: acc.afpPat + Number(it.afp_employer_usd),
      employerCost: acc.employerCost + Number(it.employer_cost_usd),
    }),
    { gross: 0, isssEmp: 0, afpEmp: 0, isr: 0, net: 0, isssPat: 0, afpPat: 0, employerCost: 0 },
  )

  const signedCount = items.filter((it) => it.signed_at).length

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={`Planilla ${formatPeriodLabel(run.period_year, run.period_month)}`} />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes/contabilidad/planillas"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Planillas
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">
            {formatPeriodLabel(run.period_year, run.period_month)}
          </span>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
                {formatPeriodLabel(run.period_year, run.period_month)}
              </h1>
              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${tone.bg} ${tone.text}`}>
                {PAYROLL_RUN_STATUS_LABELS[run.status]}
              </span>
            </div>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              {items.length} empleado{items.length === 1 ? '' : 's'} ·{' '}
              {run.status !== 'draft' && (
                <>Firmados: {signedCount} / {items.length}</>
              )}
              {run.cancel_reason && (
                <span className="block mt-1 text-rose-700">Motivo de anulación: {run.cancel_reason}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {run.status !== 'draft' && run.status !== 'cancelled' && (
              <ReportDownloadButton
                href={`/api/reportes/contabilidad/planilla/${run.id}`}
                filename={`kinetic-planilla-${run.period_year}-${String(run.period_month).padStart(2, '0')}`}
                label="Descargar planilla"
              />
            )}
            <PayrollRunActions run={run} />
          </div>
        </header>

        {/* KPIs totales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Bruto total" value={fmtUsd(totals.gross)} />
          <Kpi label="Deducciones" value={`−${fmtUsd(totals.isssEmp + totals.afpEmp + totals.isr)}`} tone="rose" />
          <Kpi label="Neto a pagar" value={fmtUsd(totals.net)} tone="teal" />
          <Kpi label="Costo patrono" value={fmtUsd(totals.employerCost)} />
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-background p-8 text-center text-sm text-fm-on-surface-variant">
            No hay empleados en esta planilla. Configurá los salarios en{' '}
            <Link href="/reportes/contabilidad/configuracion" className="text-fm-primary hover:underline">
              Configuración
            </Link>
            {' '}y volvé a crear la planilla.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30 bg-fm-background">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container">
                <tr>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Empleado</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Base</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Bruto</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Deducciones</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Neto</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <PayrollItemEditor key={it.id} item={it} editable={editable} />
                ))}
              </tbody>
              <tfoot className="bg-fm-surface-container border-t-2 border-fm-on-surface/30">
                <tr>
                  <td className="py-3 px-4 font-extrabold text-fm-on-surface">Totales</td>
                  <td className="py-3 px-4 text-right text-fm-on-surface-variant">—</td>
                  <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface">{fmtUsd(totals.gross)}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-rose-700">
                    −{fmtUsd(totals.isssEmp + totals.afpEmp + totals.isr)}
                  </td>
                  <td className="py-3 px-4 text-right font-black text-lg" style={{ color: '#00675c' }}>
                    {fmtUsd(totals.net)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'teal' }) {
  const color = tone === 'rose' ? '#b31b25' : tone === 'teal' ? '#00675c' : '#1e293b'
  return (
    <div className="rounded-2xl bg-fm-background border border-fm-surface-container-high p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">{label}</p>
      <p className="text-2xl font-black mt-2" style={{ color }}>{value}</p>
    </div>
  )
}
