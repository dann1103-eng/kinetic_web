'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { regenerateN1coLink } from '@/app/actions/invoices'
import { N1coPayButton } from './N1coPayModal'
import { PAYMENT_PROVIDER_LABELS, type Invoice, type PaymentProvider } from '@/types/db'

interface Props {
  invoice: Pick<Invoice,
    | 'id'
    | 'payment_provider'
    | 'n1co_payment_link_url'
    | 'n1co_order_id'
    | 'n1co_buyer_email'
    | 'n1co_buyer_name'
    | 'n1co_paid_at'
    | 'status'
  >
  isAdmin: boolean
}

export function N1coStatusPanel({ invoice, isAdmin }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (invoice.payment_provider === 'manual') return null

  const isLinkBased = invoice.payment_provider === 'n1co_link' || invoice.payment_provider === 'n1co_link_oneoff'
  const url = invoice.n1co_payment_link_url
  const isPaid = invoice.status === 'paid'

  function copyLink() {
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function regenerate() {
    setError(null)
    start(async () => {
      const r = await regenerateN1coLink(invoice.id)
      if ('error' in r) {
        setError(r.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant">Cobro n1co</p>
        <span
          className={
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' +
            (isPaid
              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-700 border border-amber-500/30')
          }
        >
          {isPaid ? 'Pagado' : 'Pendiente de pago'}
        </span>
      </div>

      <div className="text-xs text-fm-on-surface-variant">
        <p><strong className="text-fm-on-surface">Método:</strong> {PAYMENT_PROVIDER_LABELS[invoice.payment_provider as PaymentProvider]}</p>
      </div>

      {isLinkBased && url && !isPaid && (
        <div className="space-y-2">
          <N1coPayButton
            paymentLinkUrl={url}
            invoiceId={invoice.id}
          />
          <div className="rounded-xl bg-fm-background border border-fm-surface-container-high p-2">
            <p className="text-[10px] uppercase tracking-wider text-fm-outline-variant mb-1">O comparte el link</p>
            <p className="text-xs font-mono break-all text-fm-on-surface">{url}</p>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copyLink}
                className="flex-1 rounded-xl text-xs"
              >
                {copied ? 'Copiado ✓' : 'Copiar'}
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-xl border border-fm-primary/30 text-fm-primary text-xs font-semibold py-1.5 hover:bg-fm-primary/5"
              >
                Abrir externo
              </a>
            </div>
          </div>
          {isAdmin && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={regenerate}
              disabled={pending}
              className="w-full rounded-xl text-xs"
            >
              {pending ? 'Regenerando…' : 'Regenerar link'}
            </Button>
          )}
        </div>
      )}
      {isLinkBased && url && isPaid && (
        <div className="rounded-xl bg-fm-background border border-fm-surface-container-high p-2">
          <p className="text-[10px] uppercase tracking-wider text-fm-outline-variant mb-1">Link usado</p>
          <p className="text-xs font-mono break-all text-fm-on-surface">{url}</p>
        </div>
      )}

      {isPaid && (
        <div className="text-xs text-fm-on-surface-variant space-y-0.5">
          <p><strong className="text-fm-on-surface">Pagado:</strong> {invoice.n1co_paid_at ? new Date(invoice.n1co_paid_at).toLocaleString() : '—'}</p>
          <p><strong className="text-fm-on-surface">Comprador:</strong> {invoice.n1co_buyer_name ?? '—'}{invoice.n1co_buyer_email ? ` · ${invoice.n1co_buyer_email}` : ''}</p>
          {invoice.n1co_order_id && (
            <p><strong className="text-fm-on-surface">Orden n1co:</strong> {invoice.n1co_order_id}</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-fm-error bg-fm-error/5 rounded-xl px-2 py-1.5 border border-fm-error/20">
          {error}
        </p>
      )}
    </div>
  )
}
