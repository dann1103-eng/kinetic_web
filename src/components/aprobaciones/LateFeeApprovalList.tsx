'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { confirmLateFee, waiveLateFee, type SuggestedLateFee } from '@/app/actions/dispatch'

interface Props {
  fees: SuggestedLateFee[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function LateFeeApprovalList({ fees: initial }: Props) {
  const router = useRouter()
  const [fees, setFees] = useState(initial)
  const [waivingId, setWaivingId] = useState<string | null>(null)
  const [waiveReason, setWaiveReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function handleCharge(id: string) {
    setError(null)
    start(async () => {
      const res = await confirmLateFee(id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setFees((prev) => prev.filter((f) => f.id !== id))
      router.refresh()
    })
  }

  function handleWaive() {
    if (!waivingId) return
    setError(null)
    start(async () => {
      const res = await waiveLateFee(waivingId, waiveReason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setFees((prev) => prev.filter((f) => f.id !== waivingId))
      setWaivingId(null)
      setWaiveReason('')
      router.refresh()
    })
  }

  if (fees.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-fm-on-surface">
        Recogidas tardías por cobrar · {fees.length}
      </h2>
      <div className="rounded-2xl border border-fm-outline-variant/20 overflow-hidden bg-fm-surface-container-lowest">
        <table className="w-full text-sm">
          <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Niño/a</th>
              <th className="text-left px-4 py-2 font-semibold">Fecha</th>
              <th className="text-right px-4 py-2 font-semibold">Espera</th>
              <th className="text-right px-4 py-2 font-semibold">Cargo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id} className="border-t border-fm-outline-variant/15">
                <td className="px-4 py-2.5 font-medium text-fm-on-surface">
                  {f.family_id ? (
                    <Link
                      href={`/familias/${f.family_id}/children/${f.child_id}`}
                      className="hover:text-fm-primary hover:underline"
                    >
                      {f.child_name}
                    </Link>
                  ) : (
                    f.child_name
                  )}
                </td>
                <td className="px-4 py-2.5 text-fm-on-surface-variant whitespace-nowrap">
                  {formatDate(f.starts_at)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fm-on-surface-variant">
                  {f.minutes} min
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-800">
                  ${f.feeUsd.toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleCharge(f.id)}
                      className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60"
                    >
                      Cobrar
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setError(null)
                        setWaiveReason('')
                        setWaivingId(f.id)
                      }}
                      className="text-xs text-fm-on-surface-variant hover:underline disabled:opacity-60"
                    >
                      Perdonar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="text-[11px] text-fm-on-surface-variant">
        Al cobrar, el cargo se suma a la factura del ciclo del mes del niño/a.
      </p>

      {waivingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">Perdonar cargo</h3>
            <p className="text-xs text-fm-on-surface-variant">
              Indicá el motivo. El cargo no se cobrará.
            </p>
            <textarea
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              rows={3}
              placeholder="Motivo (ej. retraso justificado por la familia)"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWaivingId(null)}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleWaive}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
              >
                {isPending ? 'Guardando…' : 'Perdonar cargo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
