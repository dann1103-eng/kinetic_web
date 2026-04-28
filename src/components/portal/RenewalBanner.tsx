'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { N1coPayModal } from '@/components/billing/N1coPayModal'
import { selfRenewMyCycle } from '@/app/actions/portalSelfService'
import { daysUntilEnd } from '@/lib/domain/cycles'
import { formatDateEs } from '@/lib/domain/dates'

interface Props {
  /** Fecha de fin del ciclo actual (YYYY-MM-DD). */
  currentPeriodEnd: string
  /** Estado de pago del ciclo actual — si es 'unpaid' mostramos urgencia distinta. */
  currentPaymentStatus: 'paid' | 'unpaid'
  /** Plan name para personalizar el mensaje. */
  planName: string | null
  /** Total esperado del próximo cobro (USD). */
  expectedAmount: number | null
  /** Si ya hay un payment link generado para el siguiente ciclo, lo usamos directo. */
  existingScheduledLinkUrl?: string | null
  existingScheduledInvoiceId?: string | null
}

export function RenewalBanner(props: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(props.existingScheduledLinkUrl ?? null)
  const [invoiceId, setInvoiceId] = useState<string | null>(props.existingScheduledInvoiceId ?? null)

  const days = daysUntilEnd(props.currentPeriodEnd)
  const isOverdue = props.currentPaymentStatus === 'unpaid' && days < 0
  const isUrgent = days <= 3 && days >= 0
  const isUpcoming = days > 3 && days <= 7

  // No mostrar el banner si faltan más de 7 días y el ciclo está al día.
  if (!isOverdue && !isUrgent && !isUpcoming) return null

  function handleRenew() {
    setError(null)
    if (paymentUrl && invoiceId) {
      setOpen(true)
      return
    }
    start(async () => {
      const r = await selfRenewMyCycle()
      if ('error' in r) {
        setError(r.error)
        return
      }
      setPaymentUrl(r.paymentLinkUrl)
      setInvoiceId(r.invoiceId)
      setOpen(true)
    })
  }

  const tone = isOverdue
    ? { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', accent: '#b31b25', icon: 'priority_high' }
    : isUrgent
      ? { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', accent: '#d97706', icon: 'schedule' }
      : { bg: 'bg-fm-primary/5', border: 'border-fm-primary/30', text: 'text-fm-on-surface', accent: '#00675c', icon: 'event_available' }

  const title = isOverdue
    ? 'Tu ciclo está vencido'
    : isUrgent
      ? `Renueva tu plan — vence en ${days} día${days === 1 ? '' : 's'}`
      : `Tu plan termina el ${formatDateEs(props.currentPeriodEnd)}`

  const subtitle = isOverdue
    ? 'Renueva ahora para no interrumpir tus servicios.'
    : isUrgent
      ? 'Renueva ahora para asegurar tu siguiente ciclo sin interrupciones.'
      : 'Adelántate y renueva ahora — el cobro aplica al siguiente ciclo.'

  return (
    <>
      <div className={`${tone.bg} ${tone.border} ${tone.text} border-2 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap`}>
        <div className="flex items-start gap-3 flex-1 min-w-[280px]">
          <div className="rounded-full p-2 mt-0.5" style={{ background: `${tone.accent}1a`, color: tone.accent }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{tone.icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>
            {props.planName && props.expectedAmount != null && (
              <p className="text-xs mt-1">
                <span className="opacity-70">Plan {props.planName}:</span>{' '}
                <span className="font-semibold">${props.expectedAmount.toFixed(2)}</span>
              </p>
            )}
            {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
          </div>
        </div>
        <Button
          type="button"
          onClick={handleRenew}
          disabled={pending}
          className="rounded-xl text-white font-semibold whitespace-nowrap shrink-0"
          style={{ background: tone.accent }}
        >
          {pending ? 'Generando…' : 'Renovar y pagar'}
        </Button>
      </div>

      {paymentUrl && invoiceId && (
        <N1coPayModal
          open={open}
          onOpenChange={setOpen}
          paymentLinkUrl={paymentUrl}
          invoiceId={invoiceId}
        />
      )}
    </>
  )
}
