'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sealPayrollRun, markPayrollRunPaid, cancelPayrollRun } from '@/app/actions/payroll'
import type { PayrollRun } from '@/types/db'

interface Props {
  run: PayrollRun
}

export function PayrollRunActions({ run }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  function handleSeal() {
    if (!confirm('Sellar la planilla la vuelve inmutable. Después solo se puede marcar como pagada o anular. ¿Continuar?')) return
    setError(null)
    startTransition(async () => {
      const res = await sealPayrollRun(run.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleMarkPaid() {
    if (!confirm('Marcar como pagada confirma que los empleados ya recibieron el pago. ¿Continuar?')) return
    setError(null)
    startTransition(async () => {
      const res = await markPayrollRunPaid(run.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleCancel() {
    if (!cancelReason.trim()) {
      setError('El motivo es requerido.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await cancelPayrollRun(run.id, cancelReason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCancelOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-fm-error mr-2">{error}</span>}

      {run.status === 'draft' && (
        <>
          <button
            type="button"
            onClick={handleSeal}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock</span>
            Sellar planilla
          </button>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            disabled={pending}
            className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            Anular
          </button>
        </>
      )}

      {run.status === 'sealed' && (
        <>
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>paid</span>
            Marcar como pagada
          </button>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            disabled={pending}
            className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            Anular
          </button>
        </>
      )}

      {run.status === 'paid' && (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          disabled={pending}
          className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
          title="Anular una planilla ya pagada (ej. pago registrado por error)"
        >
          Anular planilla pagada
        </button>
      )}

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-fm-background shadow-xl">
            <div className="border-b border-fm-outline-variant/30 px-6 py-4">
              <h2 className="text-lg font-extrabold text-fm-on-surface">Anular planilla</h2>
              <p className="text-xs text-fm-on-surface-variant mt-1">
                Esta acción no se puede deshacer. La planilla quedará archivada con el motivo indicado.
              </p>
            </div>
            <div className="p-6">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                Motivo de anulación
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
                placeholder="Describe brevemente por qué se anula esta planilla."
              />
              {error && <p className="mt-2 text-sm text-fm-error">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-fm-outline-variant/30 px-6 py-4">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? 'Anulando…' : 'Anular planilla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
