'use client'

import { N1coPayButton } from '@/components/billing/N1coPayModal'
import { daysUntilEnd } from '@/lib/domain/cycles'
import { formatDateEs } from '@/lib/domain/dates'

export interface PendingInvoiceForBanner {
  id: string
  invoice_number: string
  total: number
  n1co_payment_link_url: string | null
}

interface Props {
  /** Fecha de fin del ciclo actual (YYYY-MM-DD). */
  currentPeriodEnd: string
  /** Estado de pago del ciclo actual. */
  currentPaymentStatus: 'paid' | 'unpaid'
  /** Si el cliente tiene `auto_billing` activado, cron emite factura 10d antes. */
  autoBillingEnabled: boolean
  /** Facturas en `status='issued'` que el cliente debe pagar. */
  pendingInvoices: PendingInvoiceForBanner[]
  /** Estado del scheduled cycle si existe. */
  scheduledCycle: { period_start: string; paid: boolean } | null
}

/**
 * Banner inteligente del portal del cliente:
 *
 * 1. Hay facturas pendientes (issued) → "Tienes facturas pendientes" + botones Pagar
 * 2. scheduled paid → "Tu siguiente ciclo ya está pagado, comienza el [fecha]"
 * 3. current overdue (vencido + unpaid) → "Tu ciclo está vencido, contacta a tu agencia"
 * 4. ≤7 días para vencer + sin scheduled invoice + sin auto_billing → "Tu agencia te enviará la factura próximamente"
 * 5. Resto → oculto
 */
export function RenewalBanner(props: Props) {
  const days = daysUntilEnd(props.currentPeriodEnd)
  const isOverdue = props.currentPaymentStatus === 'unpaid' && days < 0
  const isCloseToEnd = days >= 0 && days <= 7

  // Caso 1: facturas pendientes — máxima prioridad
  if (props.pendingInvoices.length > 0) {
    return <PendingInvoicesBanner invoices={props.pendingInvoices} />
  }

  // Caso 2: siguiente ciclo ya pagado
  if (props.scheduledCycle?.paid) {
    return <ScheduledPaidBanner periodStart={props.scheduledCycle.period_start} />
  }

  // Caso 3: ciclo actual vencido sin pagar
  if (isOverdue) {
    return <OverdueBanner periodEnd={props.currentPeriodEnd} />
  }

  // Caso 4: por vencer y sin factura del próximo ciclo
  if (isCloseToEnd) {
    return (
      <UpcomingBanner
        periodEnd={props.currentPeriodEnd}
        days={days}
        autoBillingEnabled={props.autoBillingEnabled}
      />
    )
  }

  return null
}

// ── Variants ──────────────────────────────────────────────────

function PendingInvoicesBanner({ invoices }: { invoices: PendingInvoiceForBanner[] }) {
  const total = invoices.reduce((sum, inv) => sum + Number(inv.total), 0)

  return (
    <div className="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-full p-2 mt-0.5 bg-amber-500/15 text-amber-700">
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            receipt_long
          </span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {invoices.length === 1
              ? 'Tienes una factura pendiente de pago'
              : `Tienes ${invoices.length} facturas pendientes de pago`}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            Total: <span className="font-semibold">${total.toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-3 bg-white/70 border border-amber-200 rounded-xl px-3 py-2"
          >
            <div className="text-xs">
              <p className="font-semibold text-amber-900">{inv.invoice_number}</p>
              <p className="text-amber-700">${Number(inv.total).toFixed(2)}</p>
            </div>
            {inv.n1co_payment_link_url ? (
              <N1coPayButton
                paymentLinkUrl={inv.n1co_payment_link_url}
                invoiceId={inv.id}
                className="rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 whitespace-nowrap"
              >
                Pagar ahora
              </N1coPayButton>
            ) : (
              <span className="text-[10px] text-amber-700 italic">
                Pendiente de link de pago
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScheduledPaidBanner({ periodStart }: { periodStart: string }) {
  return (
    <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl p-5 flex items-start gap-3">
      <div className="rounded-full p-2 mt-0.5 bg-emerald-500/15 text-emerald-700">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          check_circle
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold">Tu siguiente ciclo ya está pagado</p>
        <p className="text-xs opacity-80 mt-0.5">
          Comenzará el <span className="font-semibold">{formatDateEs(periodStart)}</span>. Tu ciclo
          actual continúa normal hasta esa fecha.
        </p>
      </div>
    </div>
  )
}

function OverdueBanner({ periodEnd }: { periodEnd: string }) {
  const daysOverdue = Math.abs(daysUntilEnd(periodEnd))
  return (
    <div className="bg-red-50 border-2 border-red-300 text-red-900 rounded-2xl p-5 flex items-start gap-3">
      <div className="rounded-full p-2 mt-0.5 bg-red-500/15 text-red-700">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          priority_high
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold">
          Tu ciclo está vencido {daysOverdue > 0 ? `hace ${daysOverdue} día${daysOverdue === 1 ? '' : 's'}` : ''}
        </p>
        <p className="text-xs opacity-80 mt-0.5">
          Contacta a tu agencia para emitir la factura de renovación.
        </p>
      </div>
    </div>
  )
}

function UpcomingBanner({
  periodEnd,
  days,
  autoBillingEnabled,
}: {
  periodEnd: string
  days: number
  autoBillingEnabled: boolean
}) {
  const tone = days <= 3
    ? { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', accent: '#d97706', icon: 'schedule' }
    : { bg: 'bg-fm-primary/5', border: 'border-fm-primary/30', text: 'text-fm-on-surface', accent: '#00675c', icon: 'event_available' }

  const title = days === 0
    ? 'Tu ciclo termina hoy'
    : `Tu ciclo termina en ${days} día${days === 1 ? '' : 's'} (${formatDateEs(periodEnd)})`

  const subtitle = autoBillingEnabled
    ? 'Tu agencia ya generó la factura de renovación; aparecerá aquí cuando esté lista para pagar.'
    : 'Tu agencia emitirá la factura de renovación próximamente. Te avisaremos cuando esté lista para pagar.'

  return (
    <div className={`${tone.bg} ${tone.border} ${tone.text} border-2 rounded-2xl p-5 flex items-start gap-3`}>
      <div className="rounded-full p-2 mt-0.5" style={{ background: `${tone.accent}26`, color: tone.accent }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{tone.icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}
