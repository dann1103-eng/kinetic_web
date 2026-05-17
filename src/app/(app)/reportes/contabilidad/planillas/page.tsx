import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listPayrollRuns } from '@/app/actions/payroll'
import { formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import { NewPayrollRunButton } from '@/components/reportes/contabilidad/NewPayrollRunButton'
import { PAYROLL_RUN_STATUS_LABELS, type UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable']

const STATUS_TONES: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'bg-amber-100',  text: 'text-amber-900' },
  sealed:    { bg: 'bg-sky-100',    text: 'text-sky-900' },
  paid:      { bg: 'bg-emerald-100',text: 'text-emerald-900' },
  cancelled: { bg: 'bg-slate-200',  text: 'text-slate-700' },
}

export default async function PlanillasListPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const runs = await listPayrollRuns()

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Planillas — listado mensual" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes/contabilidad"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Planillas
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Listado mensual</span>
        </div>

        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">Listado mensual</h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              Una planilla por mes. Estados: borrador (editable) → sellada (inmutable) → pagada. Se puede anular si no fue pagada.
            </p>
          </div>
          <NewPayrollRunButton />
        </header>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-background p-12 text-center">
            <span className="material-symbols-outlined text-fm-on-surface-variant" style={{ fontSize: '48px' }}>
              receipt_long
            </span>
            <p className="mt-3 text-sm text-fm-on-surface-variant">
              Aún no hay planillas creadas. Generá la primera para iniciar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30 bg-fm-background">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container">
                <tr>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Período</th>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Estado</th>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Sellada</th>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Pagada</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const tone = STATUS_TONES[r.status]
                  return (
                    <tr key={r.id} className="border-t border-fm-outline-variant/20 hover:bg-fm-surface-container-low transition-colors">
                      <td className="py-3 px-4 font-semibold text-fm-on-surface">
                        <Link
                          href={`/reportes/contabilidad/planillas/${r.id}`}
                          className="hover:text-fm-primary transition-colors"
                        >
                          {formatPeriodLabel(r.period_year, r.period_month)}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${tone.bg} ${tone.text}`}>
                          {PAYROLL_RUN_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-fm-on-surface-variant">
                        {r.sealed_at ? new Date(r.sealed_at).toLocaleDateString('es-SV') : '—'}
                      </td>
                      <td className="py-3 px-4 text-fm-on-surface-variant">
                        {r.paid_at ? new Date(r.paid_at).toLocaleDateString('es-SV') : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/reportes/contabilidad/planillas/${r.id}`}
                          className="material-symbols-outlined text-fm-on-surface-variant hover:text-fm-primary transition-colors"
                          style={{ fontSize: '20px' }}
                        >
                          chevron_right
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
