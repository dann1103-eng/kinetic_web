'use client'

/**
 * Ver y corregir lo que se le va a cobrar a la familia ANTES de generar el
 * documento.
 *
 * El botón "Detalle de pago" descargaba el PDF a ciegas, y así llegó a una mamá
 * un documento cuyas filas sumaban $236 bajo un total de $258. Acá se ve todo
 * junto —el mes y lo que se arrastra de meses anteriores—, se corrige si hace
 * falta, y recién después se descarga.
 *
 * Lo que se corrige se guarda EN EL CICLO, nunca solo en el documento: si el PDF
 * pudiera decir algo distinto a la factura, volveríamos al bug que originó todo
 * esto. Y una cantidad corregida queda **fijada a mano**, porque si no el
 * emparejado automático con la agenda la revierte al primer cambio de cita.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MonthlySessionCycle } from '@/types/db'
import { getCycleChargePreview } from '@/app/actions/cycle-charge-preview'
import { editMonthlyCycle } from '@/app/actions/monthly-cycles'
import type { CycleChargePreview } from '@/lib/domain/billing/cycle-charge-preview'
import { chargeTotalWithCarryIns } from '@/lib/domain/billing/carry-ins'
import { extraChargesTotal, type ExtraChargeLine } from '@/lib/domain/billing/extra-charges'
import { pricedSubtotal } from '@/lib/domain/billing/cycle-edit'
import { discountAmount as computeDiscount } from '@/lib/domain/discounts'
import type { DiscountKind } from '@/types/db'
import { DiscountFields } from './DiscountFields'

interface Props {
  cycleId: string
  onClose: () => void
  /** Recibe el ciclo actualizado: la tabla guarda su propia copia en estado y
   *  `router.refresh()` NO re-inicializa un `useState(props)`. Sin esto el monto
   *  de la fila se quedaba viejo hasta recargar la página a mano. */
  onSaved?: (cycle: MonthlySessionCycle) => void
}

const money = (n: number) => `$${n.toFixed(2)}`

export function CycleChargePreviewModal({ cycleId, onClose, onSaved }: Props) {
  const router = useRouter()
  const [data, setData] = useState<CycleChargePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Estado editable, sembrado de la previsualización.
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [overridden, setOverridden] = useState<Record<string, boolean>>({})
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [priceOverridden, setPriceOverridden] = useState<Record<string, boolean>>({})
  const [extras, setExtras] = useState<ExtraChargeLine[]>([])
  const [discKind, setDiscKind] = useState<DiscountKind>('none')
  const [discValue, setDiscValue] = useState(0)
  const [discReason, setDiscReason] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getCycleChargePreview(cycleId).then((res) => {
      if (!alive) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      setData(res.data)
      setCounts(Object.fromEntries(res.data.editableRows.map((r) => [r.service, r.sessionsPerMonth])))
      setOverridden(Object.fromEntries(res.data.editableRows.map((r) => [r.service, r.overridden])))
      setPrices(Object.fromEntries(res.data.editableRows.map((r) => [r.service, r.unitCostUsd])))
      setPriceOverridden(
        Object.fromEntries(res.data.editableRows.map((r) => [r.service, r.priceOverridden])),
      )
      setExtras(res.data.extraCharges)
      setDiscKind(res.data.discountKind)
      setDiscValue(res.data.discountValue)
      setDiscReason(res.data.discountReason ?? '')
    })
    return () => {
      alive = false
    }
  }, [cycleId])

  /** Mismas funciones puras que usa el servidor: lo que se ve es lo que se guarda. */
  const totals = useMemo(() => {
    if (!data) return null
    const priced = data.editableRows.map((r) => ({
      service: r.service,
      sessions_per_month: counts[r.service] ?? r.sessionsPerMonth,
      unit_cost_usd: prices[r.service] ?? r.unitCostUsd,
      billing_mode: r.billingMode as never,
    }))
    const subtotal = pricedSubtotal(priced)
    const discount = computeDiscount(subtotal, { kind: discKind, value: discValue })
    const carryInTotal = data.carryIns.reduce((s, l) => s + l.amount, 0)
    return {
      priced,
      subtotal,
      discount,
      carryInTotal,
      extrasTotal: extraChargesTotal(extras),
      totalToCharge: chargeTotalWithCarryIns({
        subtotal,
        discountAmount: discount,
        rolloverDiscountUsd: data.rolloverDiscountUsd,
        carryInTotal,
        extraChargesTotal: extraChargesTotal(extras),
      }),
    }
  }, [data, counts, prices, extras, discKind, discValue])

  const dirty = useMemo(() => {
    if (!data) return false
    if (discKind !== data.discountKind || discValue !== data.discountValue) return true
    if (JSON.stringify(extras) !== JSON.stringify(data.extraCharges)) return true
    return data.editableRows.some(
      (r) =>
        (counts[r.service] ?? r.sessionsPerMonth) !== r.sessionsPerMonth ||
        (overridden[r.service] ?? r.overridden) !== r.overridden ||
        (prices[r.service] ?? r.unitCostUsd) !== r.unitCostUsd ||
        (priceOverridden[r.service] ?? r.priceOverridden) !== r.priceOverridden,
    )
  }, [data, counts, overridden, prices, priceOverridden, extras, discKind, discValue])

  function setCount(service: string, value: number) {
    setCounts((prev) => ({ ...prev, [service]: Math.max(0, Math.round(value)) }))
    // Tocar una cantidad la fija: es una decisión de una persona, y el
    // emparejado automático no debe revertirla.
    setOverridden((prev) => ({ ...prev, [service]: true }))
  }

  function backToAuto(service: string) {
    const row = data?.editableRows.find((r) => r.service === service)
    setOverridden((prev) => ({ ...prev, [service]: false }))
    if (row) setCounts((prev) => ({ ...prev, [service]: row.sessionsPerMonth }))
  }

  function setPrice(service: string, value: number) {
    // Se admite 0 a propósito (terapia becada); la marca es lo que evita que el
    // catálogo lo vuelva a rellenar.
    setPrices((prev) => ({ ...prev, [service]: Math.max(0, value) }))
    setPriceOverridden((prev) => ({ ...prev, [service]: true }))
  }

  function priceBackToAuto(service: string) {
    const row = data?.editableRows.find((r) => r.service === service)
    setPriceOverridden((prev) => ({ ...prev, [service]: false }))
    if (row) setPrices((prev) => ({ ...prev, [service]: row.unitCostUsd }))
  }

  async function handleSave() {
    if (!data || !totals) return
    if (!reason.trim()) {
      setSaveError('Poné el motivo del cambio: queda en las notas del ciclo.')
      return
    }
    setSaving(true)
    setSaveError(null)
    const res = await editMonthlyCycle({
      cycleId,
      pricedTherapies: totals.priced.map((p) => ({
        ...p,
        sessionsOverridden: overridden[p.service] ?? false,
        unitCostOverridden: priceOverridden[p.service] ?? false,
      })),
      extraCharges: extras.filter((e) => e.description.trim().length > 0),
      discountKind: discKind,
      discountValue: discValue,
      discountReason: discReason.trim() || null,
      reason: reason.trim(),
      // Acá se corrige el COBRO, nunca la agenda. Para mover citas está
      // "Editar ciclo", que sí regenera.
      regenerateAppointments: false,
    })
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return
    }
    onSaved?.(res.cycle)
    router.refresh()
    onClose()
  }

  const editable = !!data?.canEdit

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

          {data && totals && (
            <>
              {data.cycleStatus === 'cancelled' && (
                <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                  Este ciclo está anulado: lo de abajo no se le va a cobrar a nadie.
                </p>
              )}
              {data.cycleStatus !== 'cancelled' && data.paymentStatus === 'paid' && (
                <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                  Este mes ya está pagado, así que no se edita acá: el mes no se
                  re-cobra. Para corregirlo, usá{' '}
                  <span className="font-semibold">Revisar cobros</span> — la
                  diferencia viaja a la mensualidad siguiente.
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
                      <th className="text-right py-1 font-semibold w-24"># en el mes</th>
                      <th className="text-right py-1 font-semibold">Costo unit.</th>
                      <th className="text-right py-1 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.editableRows.map((r) => {
                      const count = counts[r.service] ?? r.sessionsPerMonth
                      const isOver = overridden[r.service] ?? r.overridden
                      const price = prices[r.service] ?? r.unitCostUsd
                      const isPriceOver = priceOverridden[r.service] ?? r.priceOverridden
                      const lineTotal = r.isFlat ? price : count * price
                      return (
                        <tr key={r.service} className="border-b border-fm-outline-variant/10">
                          <td className="py-1.5">
                            {r.label}
                            {r.isFlat && ' (mensualidad)'}
                            {isOver && !r.isFlat && (
                              <span className="block text-[10px] text-fm-on-surface-variant">
                                Fijada a mano ·{' '}
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => backToAuto(r.service)}
                                    className="underline underline-offset-2 hover:text-fm-on-surface"
                                  >
                                    volver a automático
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right">
                            {r.isFlat ? (
                              <span className="tabular-nums">1</span>
                            ) : editable ? (
                              <input
                                type="number"
                                min={0}
                                value={count}
                                onChange={(e) => setCount(r.service, Number(e.target.value))}
                                className="w-16 text-right tabular-nums rounded border border-fm-outline-variant/40 bg-transparent px-1.5 py-0.5"
                              />
                            ) : (
                              <span className="tabular-nums">{count}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right">
                            {editable ? (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={price}
                                onChange={(e) => setPrice(r.service, Number(e.target.value))}
                                className="w-20 text-right tabular-nums rounded border border-fm-outline-variant/40 bg-transparent px-1.5 py-0.5"
                              />
                            ) : (
                              <span className="tabular-nums">{money(price)}</span>
                            )}
                            {isPriceOver && (
                              <span className="block text-[10px] text-fm-on-surface-variant">
                                Precio fijado ·{' '}
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => priceBackToAuto(r.service)}
                                    className="underline underline-offset-2 hover:text-fm-on-surface"
                                  >
                                    automático
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{money(lineTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                    Otros cargos del mes
                  </p>
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        setExtras((prev) => [
                          ...prev,
                          { description: '', quantity: 1, unit_price: 0 },
                        ])
                      }
                      className="text-[11px] font-semibold text-fm-primary hover:underline"
                    >
                      + Agregar
                    </button>
                  )}
                </div>
                {extras.length === 0 ? (
                  <p className="text-[11px] text-fm-on-surface-variant/70">
                    Materiales, una evaluación suelta, un cargo acordado. No llevan el descuento
                    del mes.
                  </p>
                ) : (
                  extras.map((e, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={e.description}
                        onChange={(ev) =>
                          setExtras((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)),
                          )
                        }
                        disabled={!editable}
                        placeholder="Concepto"
                        className="flex-1 text-sm rounded border border-fm-outline-variant/40 bg-transparent px-2 py-1"
                      />
                      <input
                        type="number"
                        min={0}
                        value={e.quantity}
                        onChange={(ev) =>
                          setExtras((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, quantity: Number(ev.target.value) } : x,
                            ),
                          )
                        }
                        disabled={!editable}
                        className="w-14 text-sm text-right tabular-nums rounded border border-fm-outline-variant/40 bg-transparent px-1.5 py-1"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={e.unit_price}
                        onChange={(ev) =>
                          setExtras((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, unit_price: Number(ev.target.value) } : x,
                            ),
                          )
                        }
                        disabled={!editable}
                        className="w-20 text-sm text-right tabular-nums rounded border border-fm-outline-variant/40 bg-transparent px-1.5 py-1"
                      />
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                          className="p-1 rounded text-fm-on-surface-variant hover:text-fm-error"
                          aria-label="Quitar cargo"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <DiscountFields
                subtotal={totals.subtotal}
                kind={discKind}
                value={discValue}
                reason={discReason}
                onChangeKind={setDiscKind}
                onChangeValue={setDiscValue}
                onChangeReason={setDiscReason}
                disabled={!editable}
              />

              <div className="text-sm space-y-1">
                <Row label="Subtotal" value={money(totals.subtotal)} />
                {totals.discount > 0 && (
                  <Row label="Descuento" value={`-${money(totals.discount)}`} />
                )}
                {data.rolloverDiscountUsd > 0 && (
                  <Row
                    label="Crédito por sesiones no dadas"
                    value={`-${money(data.rolloverDiscountUsd)}`}
                  />
                )}
                {totals.extrasTotal !== 0 && (
                  <Row label="Otros cargos" value={money(totals.extrasTotal)} />
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
                  {money(totals.totalToCharge)}
                </span>
              </div>

              {editable && dirty && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                    Motivo del cambio
                  </label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej. el 4 de agosto no se agendó; se cobran 3 sesiones"
                    className="w-full text-sm rounded-lg border border-fm-outline-variant/40 bg-transparent px-3 py-1.5"
                  />
                  <p className="text-[11px] text-fm-on-surface-variant">
                    Queda en las notas del ciclo. Esto corrige el cobro, no la agenda.
                  </p>
                </div>
              )}

              {saveError && <p className="text-sm text-fm-error">{saveError}</p>}

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
          {editable && dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-fm-primary text-fm-primary hover:bg-fm-primary/5 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
          <a
            href={`/api/ciclos/${cycleId}/detalle`}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-semibold px-3 py-1.5 rounded-lg bg-fm-primary text-white hover:opacity-90 ${
              dirty ? 'pointer-events-none opacity-40' : ''
            }`}
            title={dirty ? 'Guardá los cambios antes de descargar' : undefined}
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
