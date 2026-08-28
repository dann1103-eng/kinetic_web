'use client'

import { useState, useTransition } from 'react'
import {
  applyMonthChargeSync,
  clearCycleAdjustment,
  listPendingAdjustments,
  previewMonthChargeSync,
  type MonthChargeSyncRow,
  type PaidCycleMode,
  type PendingAdjustmentRow,
} from '@/app/actions/cycle-charge-sync'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function label(service: string): string {
  return SERVICE_TYPE_LABELS[service as ServiceType] ?? service
}

export function SincronizarCobrosClient() {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<MonthChargeSyncRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Por ciclo pagado: qué se hace con la diferencia. Default 'carry'. */
  const [paidModes, setPaidModes] = useState<Record<string, PaidCycleMode>>({})
  const [adjustments, setAdjustments] = useState<PendingAdjustmentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isLoading, startLoad] = useTransition()
  const [isApplying, startApply] = useTransition()
  const [clearingId, setClearingId] = useState<string | null>(null)

  async function refresh() {
    const [res, adj] = await Promise.all([
      previewMonthChargeSync(`${month}-01`),
      listPendingAdjustments(`${month}-01`),
    ])
    if (!res.ok) {
      setError(res.error)
      setRows(null)
      return
    }
    setRows(res.rows)
    // Los niños en pausa arrancan DESTILDADOS: su agenda suele tener sesiones
    // que ya no se van a dar, y emparejar les cobraría de más.
    setSelected(new Set(res.rows.filter((r) => !r.childPaused).map((r) => r.cycleId)))
    setPaidModes({})
    setAdjustments(adj.ok ? adj.rows : [])
  }

  function handlePreview() {
    setError(null)
    setDone(null)
    startLoad(refresh)
  }

  function handleClearAdjustment(row: PendingAdjustmentRow) {
    if (
      !window.confirm(
        `Se va a quitar el ajuste de ${row.childName} y dejar el mes registrado en $${row.detailAmount.toFixed(2)}. Hacelo solo si la familia YA pagó ese monto. ¿Continuar?`,
      )
    ) {
      return
    }
    setClearingId(row.cycleId)
    startApply(async () => {
      const res = await clearCycleAdjustment(row.cycleId)
      if (!res.ok) setError(res.error)
      setClearingId(null)
      await refresh()
    })
  }

  function handleApply() {
    if (!rows || selected.size === 0) return
    if (
      !window.confirm(
        `Se van a emparejar ${selected.size} ciclo(s) con su agenda. Los pendientes cambian de monto y se les regenera la factura si ya tenían; los pagados no se re-cobran (la diferencia se arrastra al mes siguiente). ¿Continuar?`,
      )
    ) {
      return
    }
    setError(null)
    startApply(async () => {
      const res = await applyMonthChargeSync(
        `${month}-01`,
        [...selected].map((cycleId) => ({ cycleId, paidMode: paidModes[cycleId] ?? 'carry' })),
      )
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone(`Listo: ${res.applied} ciclo(s) actualizado(s)${res.skipped > 0 ? `, ${res.skipped} sin cambios` : ''}.`)
      await refresh()
    })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalDiff = (rows ?? [])
    .filter((r) => selected.has(r.cycleId))
    .reduce((s, r) => s + (r.newAmount - r.currentAmount), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">Mes</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isLoading}
          className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isLoading ? 'Revisando…' : 'Revisar el mes'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {done}
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-sm text-fm-on-surface-variant">
          Todos los ciclos de este mes cobran exactamente lo que tienen agendado. No hay nada que
          emparejar.
        </p>
      )}

      {adjustments && adjustments.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-2">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {adjustments.length} ciclo(s) pagado(s) con diferencia arrastrada a la mensualidad
              siguiente
            </p>
            <p className="text-xs text-amber-900/90 mt-0.5">
              Se corrigió el detalle de un mes ya pagado, así que la diferencia quedó pendiente para
              cobrarla o acreditarla el mes que viene. <b>Si la familia ya había pagado el monto
              correcto</b>, ese arrastre sobra: quitalo acá.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white/70">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-amber-900/80">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Niño/a</th>
                  <th className="px-3 py-2 text-right font-semibold">Registrado</th>
                  <th className="px-3 py-2 text-right font-semibold">Costo real</th>
                  <th className="px-3 py-2 text-right font-semibold">Arrastre</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.cycleId} className="border-t border-amber-200/60">
                    <td className="px-3 py-2 text-fm-on-surface">{a.childName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${a.recordedAmount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      ${a.detailAmount.toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        a.adjustment < 0 ? 'text-emerald-700' : 'text-fm-error'
                      }`}
                    >
                      {a.adjustment > 0 ? '+' : ''}
                      {a.adjustment.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleClearAdjustment(a)}
                        disabled={clearingId === a.cycleId}
                        className="text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
                      >
                        {clearingId === a.cycleId ? 'Quitando…' : 'Ya pagó lo correcto'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-fm-outline-variant/20">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container-low text-[11px] uppercase tracking-wide text-fm-on-surface-variant">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-semibold">Niño/a</th>
                  <th className="px-3 py-2 text-left font-semibold">Diferencias</th>
                  <th className="px-3 py-2 text-right font-semibold">Cobra hoy</th>
                  <th className="px-3 py-2 text-right font-semibold">Debería cobrar</th>
                  <th className="px-3 py-2 text-right font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.newAmount - r.currentAmount
                  return (
                    <tr key={r.cycleId} className="border-t border-fm-outline-variant/10 align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.cycleId)}
                          onChange={() => toggle(r.cycleId)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-fm-on-surface">{r.childName}</span>
                        <span className="block text-[11px] text-fm-on-surface-variant">
                          {r.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                          {r.hasInvoice ? ' · con factura' : ''}
                        </span>
                        {r.paymentStatus === 'paid' && (
                          <span className="mt-1 block text-[11px] text-fm-on-surface">
                            <span className="block text-fm-on-surface-variant mb-0.5">
                              Ya pagado — ¿cuánto recibieron en caja?
                            </span>
                            <label className="flex items-start gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                className="mt-[3px]"
                                checked={(paidModes[r.cycleId] ?? 'carry') === 'carry'}
                                onChange={() =>
                                  setPaidModes((p) => ({ ...p, [r.cycleId]: 'carry' }))
                                }
                              />
                              <span>
                                Pagó ${r.currentAmount.toFixed(2)} — la diferencia va a la
                                mensualidad siguiente
                              </span>
                            </label>
                            <label className="flex items-start gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                className="mt-[3px]"
                                checked={paidModes[r.cycleId] === 'already_correct'}
                                onChange={() =>
                                  setPaidModes((p) => ({ ...p, [r.cycleId]: 'already_correct' }))
                                }
                              />
                              <span>
                                Pagó ${r.newAmount.toFixed(2)} — solo corregir el registro, sin
                                arrastre
                              </span>
                            </label>
                          </span>
                        )}
                        {r.childPaused && (
                          <span className="block text-[11px] text-amber-700">
                            En pausa temporal — pausar no cancela las citas ya agendadas. Revisá
                            la agenda antes de emparejar: si esas sesiones no se van a dar, hay
                            que quitarlas de la agenda, no cobrarlas.
                          </span>
                        )}
                        {r.unpricedServices.length > 0 && (
                          <span className="block text-[11px] text-amber-700">
                            Sin precio en catálogo: {r.unpricedServices.map(label).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {r.lines.map((l) => (
                          <span key={l.service} className="block">
                            {label(l.service)}: cobra {l.charged} → agendadas{' '}
                            <b>{l.scheduled}</b>
                          </span>
                        ))}
                        {r.backfilledPrices.map((b) => (
                          <span key={b.service} className="block text-fm-primary">
                            {label(b.service)}: sin precio → <b>${b.unitCost.toFixed(2)}</b> del
                            catálogo
                          </span>
                        ))}
                        {/* Desfase solo del monto: las terapias ya cuadran con la
                            agenda, el que quedó viejo es `payment_amount_usd`.
                            Sin esta línea la celda salía en blanco. */}
                        {r.lines.length === 0 && r.backfilledPrices.length === 0 && (
                          <span className="block text-fm-on-surface-variant">
                            El detalle ya cuadra con la agenda; el monto registrado del ciclo no.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ${r.currentAmount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        ${r.newAmount.toFixed(2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          diff > 0 ? 'text-emerald-700' : 'text-fm-error'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}
                        {diff.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fm-on-surface-variant">
              {selected.size} de {rows.length} seleccionado(s) · efecto neto{' '}
              <b className={totalDiff >= 0 ? 'text-emerald-700' : 'text-fm-error'}>
                {totalDiff >= 0 ? '+' : ''}
                {totalDiff.toFixed(2)}
              </b>
            </p>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying || selected.size === 0}
              className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isApplying ? 'Aplicando…' : `Emparejar ${selected.size} ciclo(s)`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
