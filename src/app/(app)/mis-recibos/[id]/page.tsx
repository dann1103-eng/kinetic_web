import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { getMyPayrollItem } from '@/app/actions/payroll'
import { fmtUsd, formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import { SignReceiptButton } from '@/components/reportes/contabilidad/SignReceiptButton'
import { ReportDownloadButton } from '@/components/reportes/ReportDownloadButton'
import { PAYROLL_RUN_STATUS_LABELS } from '@/types/db'

export const dynamic = 'force-dynamic'

const EXCLUDED_ROLES = ['client', 'family']

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MiReciboDetailPage({ params }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (EXCLUDED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { id } = await params
  const item = await getMyPayrollItem(id)
  if (!item) notFound()

  const period = formatPeriodLabel(item.run.period_year, item.run.period_month)

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={`Recibo · ${period}`} />

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/mis-recibos"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Mis recibos
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">{period}</span>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">{period}</h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              Recibo de planilla · {PAYROLL_RUN_STATUS_LABELS[item.run.status]}
              {item.signed_at && (
                <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900">
                  ✓ Firmado el {new Date(item.signed_at).toLocaleDateString('es-SV')}
                </span>
              )}
            </p>
          </div>
          <ReportDownloadButton
            href={`/api/reportes/contabilidad/recibo/${item.id}`}
            filename={`kinetic-recibo-${item.run.period_year}-${String(item.run.period_month).padStart(2, '0')}`}
            label="Descargar recibo PDF"
          />
        </header>

        {/* Detalle */}
        <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-background overflow-hidden">
          <div className="px-6 py-4 border-b border-fm-outline-variant/30 bg-fm-surface-container">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-fm-on-surface-variant">
              Detalle del cálculo
            </h2>
          </div>
          <div className="p-6 space-y-1.5 text-sm">
            <Row label="Salario base" value={fmtUsd(Number(item.base_salary_usd))} />
            {Number(item.extra_hours_amount_usd) > 0 && (
              <Row
                label={`Horas extras (${item.extra_hours} h)`}
                value={fmtUsd(Number(item.extra_hours_amount_usd))}
              />
            )}
            {Number(item.bonus_usd) > 0 && (
              <Row label="Bono / pago extra" value={fmtUsd(Number(item.bonus_usd))} />
            )}
            <Row label="Bruto" value={fmtUsd(Number(item.gross_total_usd))} bold divider />
            <Row label="ISSS empleado" value={`−${fmtUsd(Number(item.isss_employee_usd))}`} negative />
            <Row label="AFP empleado" value={`−${fmtUsd(Number(item.afp_employee_usd))}`} negative />
            <Row label="ISR" value={`−${fmtUsd(Number(item.isr_usd))}`} negative />
            {Number(item.other_deductions_usd) > 0 && (
              <Row label="Otras deducciones" value={`−${fmtUsd(Number(item.other_deductions_usd))}`} negative />
            )}
            <Row label="Total deducciones" value={`−${fmtUsd(Number(item.total_deductions_usd))}`} negative bold />
            <div className="mt-4 pt-4 border-t-2 border-fm-on-surface flex items-center justify-between">
              <span className="text-base font-extrabold text-fm-on-surface">Neto a pagar</span>
              <span className="text-3xl font-black" style={{ color: '#00675c' }}>
                {fmtUsd(Number(item.net_pay_usd))}
              </span>
            </div>
          </div>
        </div>

        {item.notes && (
          <div className="rounded-xl border border-fm-outline-variant/30 bg-fm-background p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-1">
              Notas
            </h3>
            <p className="text-sm text-fm-on-surface whitespace-pre-line">{item.notes}</p>
          </div>
        )}

        {!item.signed_at && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-fm-primary/30 bg-fm-primary/5 p-6 text-center">
            <p className="text-sm text-fm-on-surface">
              Si los montos son correctos, firmá tu recibo para confirmar la recepción.
            </p>
            <SignReceiptButton itemId={item.id} />
          </div>
        )}

        {item.signed_at && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
            <span className="font-bold">✓ Recibo firmado.</span>{' '}
            Confirmaste recepción el {new Date(item.signed_at).toLocaleString('es-SV')}
            {item.signed_ip && ` desde ${item.signed_ip}`}.
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, bold, negative, divider }: {
  label: string
  value: string
  bold?: boolean
  negative?: boolean
  divider?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${divider ? 'border-t border-fm-outline-variant/40 mt-2 pt-3' : ''}`}>
      <span className={bold ? 'font-extrabold text-fm-on-surface' : 'text-fm-on-surface-variant'}>
        {label}
      </span>
      <span className={`${bold ? 'font-extrabold' : 'font-medium'} ${negative ? 'text-rose-700' : 'text-fm-on-surface'}`}>
        {value}
      </span>
    </div>
  )
}
