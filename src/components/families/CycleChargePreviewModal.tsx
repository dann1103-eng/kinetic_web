'use client'

/**
 * Ver lo que se le va a cobrar a la familia ANTES de generar el documento.
 *
 * El botón "Detalle de pago" descargaba el PDF a ciegas, y así llegó a una mamá
 * un documento cuyas filas sumaban $236 bajo un total de $258. Acá se ve todo
 * junto —el mes y lo que se arrastra de meses anteriores— y recién después se
 * descarga.
 */

import { useEffect, useState } from 'react'
import { getCycleChargePreview } from '@/app/actions/cycle-charge-preview'
import type { CycleChargePreview } from '@/lib/domain/billing/cycle-charge-preview'

interface Props {
  cycleId: string
  onClose: () => void
}

const money = (n: number) => `$${n.toFixed(2)}`

export function CycleChargePreviewModal({ cycleId, onClose }: Props) {
  const [data, setData] = useState<CycleChargePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getCycleChargePreview(cycleId).then((res) => {
      if (!alive) return
      if (res.ok) setData(res.data)
      else setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [cycleId])

  const carryInTotal = (data?.carryIns ?? []).reduce((s, l) => s + l.amount, 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">
            Detalle de pago{data ? ` — ${data.detail.periodLabel}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {error && <p className="text-sm text-fm-error">{error}</p>}
          {!data && !error && (
            <p className="text-sm text-fm-on-surface-variant">Cargando el detalle…</p>
          )}

          {data && (
            <>
              {data.cycleStatus === 'cancelled' && (
                <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                  Este ciclo está anulado: lo de abajo no se le va a cobrar a nadie.
                </p>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-1">
                  {data.childName}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-fm-on-surface-variant border-b border-fm-outline-variant/20">
                      <th className="text-left py-1 font-semibold">Terapia</th>
                      <th className="text-right py-1 font-semibold"># en el mes</th>
                      <th className="text-right py-1 font-semibold">Costo unit.</th>
                      <th className="text-right py-1 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detail.costRows.map((r) => (
                      <tr key={r.service} className="border-b border-fm-outline-variant/10">
                        <td className="py-1.5">
                          {r.label}
                          {r.isFlat ? ' (mensualidad)' : ''}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(r.unitCost)}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-sm space-y-1">
                <Row label="Subtotal" value={money(data.detail.subtotal)} />
                {data.detail.discountAmount > 0 && (
                  <Row
                    label={data.detail.discountLabel ?? 'Descuento'}
                    value={`-${money(data.detail.discountAmount)}`}
                  />
                )}
                {data.rolloverDiscountUsd > 0 && (
                  <Row
                    label="Crédito por sesiones no dadas"
                    value={`-${money(data.rolloverDiscountUsd)}`}
                  />
                )}
              </div>

              {data.carryIns.length > 0 && (
                <div className="rounded-lg bg-fm-surface-container/60 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-1">
                    Se suma a este cobro
                  </p>
                  <div className="text-sm space-y-1">
                    {data.carryIns.map((l, i) => (
                      <Row
                        key={i}
                        label={l.description}
                        value={`${l.amount < 0 ? '-' : ''}${money(Math.abs(l.amount))}`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-fm-on-surface-variant mt-1">
                    Vienen de meses anteriores. Se corrigen en el mes que los originó, no acá.
                  </p>
                </div>
              )}

              <div className="border-t border-fm-outline-variant/20 pt-2 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-fm-on-surface">Total a cobrar</span>
                <span className="text-lg font-semibold tabular-nums text-fm-on-surface">
                  {money(data.totalToCharge)}
                </span>
              </div>

              {Math.abs(data.totalToCharge - data.detail.total) >= 0.01 && (
                <p className="text-[11px] text-fm-on-surface-variant">
                  El documento del mes suma {money(data.detail.total)}; la diferencia son{' '}
                  {carryInTotal < 0 ? 'créditos' : 'cargos'} de meses anteriores y el crédito por
                  sesiones no dadas, que se cobran en la factura.
                </p>
              )}

              {data.detail.agendaNotes.map((n, i) => (
                <p key={i} className="text-[11px] text-fm-on-surface-variant">
                  {n}
                </p>
              ))}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-fm-outline-variant/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-fm-on-surface-variant hover:text-fm-on-surface"
          >
            Cerrar
          </button>
          <a
            href={`/api/ciclos/${cycleId}/detalle`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-fm-primary text-white hover:opacity-90"
          >
            Descargar PDF
          </a>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-fm-on-surface-variant">{label}</span>
      <span className="tabular-nums text-fm-on-surface">{value}</span>
    </div>
  )
}
