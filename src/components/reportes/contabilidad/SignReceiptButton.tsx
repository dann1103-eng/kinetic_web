'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signMyPayrollItem } from '@/app/actions/payroll'

interface Props {
  itemId: string
}

export function SignReceiptButton({ itemId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleSign() {
    setError(null)
    startTransition(async () => {
      const res = await signMyPayrollItem(itemId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-fm-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>verified</span>
        Firmar recibo (conforme)
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-fm-background shadow-xl">
            <div className="border-b border-fm-outline-variant/30 px-6 py-4">
              <h2 className="text-lg font-extrabold text-fm-on-surface">Firmar recepción de recibo</h2>
              <p className="text-xs text-fm-on-surface-variant mt-2 leading-relaxed">
                Al firmar confirmás que recibiste y estás conforme con los montos de tu planilla del período. Esta acción no se puede deshacer. Quedará registrada con tu usuario, fecha y dirección IP.
              </p>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="text-sm text-fm-error">{error}</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSign}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>verified</span>
                {pending ? 'Firmando…' : 'Confirmar firma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
