import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listMyPayrollItems } from '@/app/actions/payroll'
import { fmtUsd, formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import { PAYROLL_RUN_STATUS_LABELS } from '@/types/db'

export const dynamic = 'force-dynamic'

const EXCLUDED_ROLES = ['client', 'family']

const STATUS_TONES: Record<string, { bg: string; text: string }> = {
  sealed: { bg: 'bg-sky-100', text: 'text-sky-900' },
  paid:   { bg: 'bg-emerald-100', text: 'text-emerald-900' },
}

export default async function MisRecibosPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (EXCLUDED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const items = await listMyPayrollItems()

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Mis recibos" />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        <header className="pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">Mis recibos</h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Historial de planillas selladas. Revisá el detalle de cada mes y firmá tu recibo al recibirlo.
          </p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-background p-12 text-center">
            <span className="material-symbols-outlined text-fm-on-surface-variant" style={{ fontSize: '48px' }}>
              receipt
            </span>
            <p className="mt-3 text-sm text-fm-on-surface-variant">
              Aún no tenés recibos. Aparecerán cuando la directora o contable sellen la planilla del mes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const tone = STATUS_TONES[it.run.status] ?? { bg: 'bg-slate-100', text: 'text-slate-700' }
              return (
                <Link
                  key={it.id}
                  href={`/mis-recibos/${it.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-fm-outline-variant/30 bg-fm-background p-5 hover:border-fm-primary hover:shadow-sm transition-all"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
                    style={{ backgroundColor: '#00675c' }}
                  >
                    <span className="material-symbols-outlined text-white" style={{ fontSize: '24px' }}>
                      receipt_long
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-extrabold text-fm-on-surface">
                        {formatPeriodLabel(it.run.period_year, it.run.period_month)}
                      </h2>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${tone.bg} ${tone.text}`}>
                        {PAYROLL_RUN_STATUS_LABELS[it.run.status]}
                      </span>
                      {it.signed_at && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900">
                          ✓ Firmado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fm-on-surface-variant mt-1">
                      Neto: <span className="font-bold" style={{ color: '#00675c' }}>{fmtUsd(Number(it.net_pay_usd))}</span>
                      {' · '}
                      Bruto: {fmtUsd(Number(it.gross_total_usd))}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-fm-on-surface-variant">
                    arrow_forward
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
