'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { N1coPayModal } from '@/components/billing/N1coPayModal'
import { purchaseExtraCambios, purchaseExtraContent } from '@/app/actions/portalSelfService'
import type { ContentType } from '@/types/db'

interface ExtraOption {
  kind: 'cambios' | 'content'
  contentType?: ContentType
  qty: number
  pricePerPackage: number
  label: string
  description: string
  icon: string
}

interface Props {
  /** Paquetes de cambios disponibles (default 5 cambios — $25). */
  cambiosOptions?: { qty: number; price: number; note?: string | null }[]
  /** Tipos de contenido extra que el cliente puede comprar (estatico, video_corto, etc.). */
  contentOptions?: { contentType: ContentType; price: number; label: string }[]
}

const DEFAULT_CAMBIOS: { qty: number; price: number }[] = [
  { qty: 5, price: 25 },
]

const DEFAULT_CONTENT: { contentType: ContentType; price: number; label: string }[] = [
  { contentType: 'estatico', price: 15, label: 'Estático' },
  { contentType: 'video_corto', price: 25, label: 'Video corto' },
  { contentType: 'reel', price: 25, label: 'Reel' },
  { contentType: 'short', price: 25, label: 'Short' },
]

export function ExtrasSection({ cambiosOptions, contentOptions }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const cambios = cambiosOptions ?? DEFAULT_CAMBIOS
  const content = contentOptions ?? DEFAULT_CONTENT

  function handleBuyCambios(qty: number, price: number) {
    const key = `cambios:${qty}`
    setError(null)
    setLoadingKey(key)
    start(async () => {
      const r = await purchaseExtraCambios({ qty, pricePerPackage: price })
      setLoadingKey(null)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setPaymentUrl(r.paymentLinkUrl)
      setInvoiceId(r.invoiceId)
      setOpen(true)
    })
  }

  function handleBuyContent(contentType: ContentType) {
    const key = `content:${contentType}`
    setError(null)
    setLoadingKey(key)
    start(async () => {
      const r = await purchaseExtraContent({ contentType, qty: 1 })
      setLoadingKey(null)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setPaymentUrl(r.paymentLinkUrl)
      setInvoiceId(r.invoiceId)
      setOpen(true)
    })
  }

  const allOptions: ExtraOption[] = [
    ...cambios.map(c => ({
      kind: 'cambios' as const,
      qty: c.qty,
      pricePerPackage: c.price,
      label: `${c.qty} cambios extras`,
      description: 'Cambios adicionales sobre tus artes',
      icon: 'edit',
    })),
    ...content.map(ct => ({
      kind: 'content' as const,
      contentType: ct.contentType,
      qty: 1,
      pricePerPackage: ct.price,
      label: `1 ${ct.label} extra`,
      description: 'Contenido adicional fuera de tu plan',
      icon: ct.contentType === 'estatico' ? 'image' : 'movie',
    })),
  ]

  return (
    <>
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-fm-on-surface">Comprar extras</h2>
          <p className="text-xs text-fm-on-surface-variant">
            Pago seguro vía n1co
          </p>
        </div>
        {error && (
          <p className="text-xs text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20 mb-3">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allOptions.map((opt) => {
            const key = opt.kind === 'cambios' ? `cambios:${opt.qty}` : `content:${opt.contentType}`
            const isThisLoading = loadingKey === key && pending
            return (
              <button
                key={key}
                type="button"
                disabled={pending}
                onClick={() => {
                  if (opt.kind === 'cambios') handleBuyCambios(opt.qty, opt.pricePerPackage)
                  else if (opt.contentType) handleBuyContent(opt.contentType)
                }}
                className="group flex flex-col items-start gap-2 p-4 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest hover:border-fm-primary hover:bg-fm-primary/5 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="material-symbols-outlined text-fm-primary"
                    style={{ fontSize: 22 }}
                  >
                    {opt.icon}
                  </span>
                  <span className="text-xs font-bold text-fm-primary">
                    ${opt.pricePerPackage.toFixed(2)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-fm-on-surface">{opt.label}</p>
                  <p className="text-xs text-fm-on-surface-variant mt-0.5">{opt.description}</p>
                </div>
                <span
                  className={
                    'mt-1 text-xs font-medium ' +
                    (isThisLoading ? 'text-fm-on-surface-variant' : 'text-fm-primary group-hover:underline')
                  }
                >
                  {isThisLoading ? 'Generando…' : 'Comprar →'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {paymentUrl && invoiceId && (
        <N1coPayModal
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) {
              setPaymentUrl(null)
              setInvoiceId(null)
            }
          }}
          paymentLinkUrl={paymentUrl}
          invoiceId={invoiceId}
        />
      )}
    </>
  )
}
