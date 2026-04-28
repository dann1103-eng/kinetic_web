'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentLinkUrl: string
  invoiceId: string
}

type PaymentStatus = 'loading' | 'paying' | 'success' | 'cancel' | 'error'

/**
 * Modal con iframe del checkout n1co.
 * Detecta fin del flujo de pago vía postMessage desde el callback page del CRM.
 * Cuando llega 'payment_success' cierra el modal y refresca la página
 * (la factura ya fue marcada como pagada por el webhook server-side).
 */
export function N1coPayModal({ open, onOpenChange, paymentLinkUrl, invoiceId }: Props) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<PaymentStatus>('loading')
  const [, startTransition] = useTransition()

  // Reset al abrir
  useEffect(() => {
    if (open) setStatus('loading')
  }, [open])

  // Listener de postMessage del callback page
  useEffect(() => {
    if (!open) return
    function handler(event: MessageEvent) {
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.source !== 'fm-crm-n1co-callback') return
      // Si trae invoiceId, validamos que sea esta factura (defensivo)
      if (data.invoiceId && data.invoiceId !== invoiceId) return

      if (data.type === 'payment_success') {
        setStatus('success')
        // Dar 1.5s al webhook para procesar antes de refrescar
        setTimeout(() => {
          startTransition(() => {
            router.refresh()
          })
          onOpenChange(false)
        }, 1500)
      } else if (data.type === 'payment_cancel') {
        setStatus('cancel')
        setTimeout(() => onOpenChange(false), 1200)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [open, invoiceId, onOpenChange, router])

  // Detectar carga del iframe
  useEffect(() => {
    if (!open || !iframeRef.current) return
    const iframe = iframeRef.current
    const onLoad = () => setStatus(prev => (prev === 'loading' ? 'paying' : prev))
    iframe.addEventListener('load', onLoad)
    return () => iframe.removeEventListener('load', onLoad)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Cerrar solo si se clicea el backdrop, no el contenido
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Pago con n1co"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[92vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-fm-surface-container-high bg-fm-surface-container-lowest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-fm-primary" style={{ fontSize: 18 }}>
              credit_card
            </span>
            <p className="text-sm font-semibold text-fm-on-surface">Pago seguro con n1co</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-fm-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </header>

        <div className="relative flex-1 min-h-[600px]">
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-fm-surface-container-lowest z-10">
              <div className="text-center">
                <div className="inline-block w-8 h-8 border-4 border-fm-primary/30 border-t-fm-primary rounded-full animate-spin" />
                <p className="text-xs text-fm-on-surface-variant mt-3">Cargando pasarela…</p>
              </div>
            </div>
          )}
          {status === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-50 z-10">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl mx-auto mb-3">
                  ✓
                </div>
                <p className="text-base font-semibold text-emerald-700">¡Pago recibido!</p>
                <p className="text-xs text-emerald-600 mt-1">Confirmando con n1co…</p>
              </div>
            </div>
          )}
          {status === 'cancel' && (
            <div className="absolute inset-0 flex items-center justify-center bg-amber-50 z-10">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500 text-white flex items-center justify-center text-3xl mx-auto mb-3">
                  ✕
                </div>
                <p className="text-base font-semibold text-amber-700">Pago cancelado</p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={paymentLinkUrl}
            title="Pago con n1co"
            className="w-full h-full border-0 block"
            allow="payment"
          />
        </div>

        <footer className="px-4 py-2 border-t border-fm-surface-container-high bg-fm-surface-container-lowest">
          <p className="text-[10px] text-fm-outline text-center">
            Procesado por n1co · Tus datos de tarjeta nunca pasan por nuestros servidores.
          </p>
        </footer>
      </div>
    </div>
  )
}

/** Hook helper para abrir el modal desde un trigger button. */
export function useN1coPayModal() {
  const [open, setOpen] = useState(false)
  return { open, setOpen, Modal: N1coPayModal as typeof N1coPayModal }
}

/** Botón + modal listo para usar. */
export function N1coPayButton({
  paymentLinkUrl,
  invoiceId,
  className,
  children,
}: {
  paymentLinkUrl: string
  invoiceId: string
  className?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex-1 rounded-xl text-white text-xs font-semibold'
        }
        style={className ? undefined : { background: 'linear-gradient(135deg, #00675c 0%, #5bf4de 100%)' }}
      >
        {children ?? 'Pagar ahora aquí'}
      </Button>
      <N1coPayModal
        open={open}
        onOpenChange={setOpen}
        paymentLinkUrl={paymentLinkUrl}
        invoiceId={invoiceId}
      />
    </>
  )
}
