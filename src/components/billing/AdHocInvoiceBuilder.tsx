'use client'

/**
 * AdHocInvoiceBuilder — UI reutilizable para armar una factura suelta de
 * Kinetic a partir del service_catalog.
 *
 * Lo usan:
 *   • NewAdHocInvoiceModal (desde la ficha del niño)
 *   • La página standalone /billing/invoices/new (Kinetic)
 *
 * Auto-aplica el precio BK (unit_price_bk_usd) si el niño está en programa
 * matutino. Maneja su propio estado (líneas, filtros, pago) y dispara
 * `onCreated(invoiceId)` cuando la factura se crea con éxito.
 */

import { useMemo, useState, useTransition } from 'react'
import { createAdHocInvoice } from '@/app/actions/ad-hoc-invoices'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  type MorningProgram,
  type ServiceCatalogItem,
  type ServiceCategory,
} from '@/types/db'

interface Line {
  catalog_item_id: string
  description: string
  quantity: number
  unit_price_usd: number
}

interface Props {
  childId: string
  enrolledProgram: MorningProgram | null
  catalog: ServiceCatalogItem[]
  /** Llamado con el id de la factura creada. */
  onCreated: (invoiceId: string) => void
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`
}

function effectivePrice(item: ServiceCatalogItem, enrolledProgram: MorningProgram | null): number {
  if (enrolledProgram && item.unit_price_bk_usd != null) {
    return Number(item.unit_price_bk_usd)
  }
  return Number(item.unit_price_usd)
}

export function AdHocInvoiceBuilder({ childId, enrolledProgram, catalog, onCreated }: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [filter, setFilter] = useState('')
  const [filterCategory, setFilterCategory] = useState<ServiceCategory | 'all'>('all')
  const [paymentNow, setPaymentNow] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card' | 'other'>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return catalog
      .filter((c) => c.active)
      .filter((c) => filterCategory === 'all' || c.category === filterCategory)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }, [catalog, filter, filterCategory])

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_price_usd, 0),
    [lines],
  )

  function addLine(item: ServiceCatalogItem) {
    const price = effectivePrice(item, enrolledProgram)
    setLines((prev) => [
      ...prev,
      { catalog_item_id: item.id, description: item.name, quantity: 1, unit_price_usd: price },
    ])
  }

  function patchLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit() {
    setError(null)
    if (lines.length === 0) {
      setError('Agregá al menos un item a la factura.')
      return
    }
    startTransition(async () => {
      const res = await createAdHocInvoice({
        child_id: childId,
        lines,
        status: paymentNow ? 'paid' : 'sent',
        payment_method: paymentNow ? paymentMethod : null,
        payment_reference: paymentNow ? paymentReference.trim() || null : null,
        notes: notes.trim() || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onCreated(res.invoice_id)
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-fm-outline-variant/20">
      {/* Columna izq: catálogo */}
      <div className="md:col-span-3 p-4 space-y-3 overflow-y-auto max-h-[55vh]">
        <div className="flex gap-2 items-center sticky top-0 bg-fm-surface-container-lowest pb-2 z-10">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar item…"
            className="flex-1 text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ServiceCategory | 'all')}
            className="text-sm px-2 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl"
          >
            <option value="all">Todas las categorías</option>
            {SERVICE_CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {SERVICE_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          {visibleItems.length === 0 ? (
            <p className="text-xs text-fm-on-surface-variant italic px-2">
              No hay items que coincidan con tu búsqueda.
            </p>
          ) : (
            visibleItems.map((item) => {
              const price = effectivePrice(item, enrolledProgram)
              const showBkBadge =
                enrolledProgram &&
                item.unit_price_bk_usd != null &&
                item.unit_price_bk_usd !== item.unit_price_usd
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addLine(item)}
                  className="w-full text-left rounded-lg border border-fm-outline-variant/20 hover:border-fm-primary/40 hover:bg-fm-primary/5 px-3 py-2 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fm-on-surface truncate">{item.name}</p>
                      <p className="text-[10px] text-fm-on-surface-variant uppercase tracking-wide">
                        {SERVICE_CATEGORY_LABELS[item.category]}
                        {item.duration_minutes && ` · ${item.duration_minutes} min`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-fm-primary tabular-nums">{fmt(price)}</p>
                      {showBkBadge && (
                        <p className="text-[9px] text-fm-on-surface-variant line-through tabular-nums">
                          {fmt(item.unit_price_usd)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Columna der: carrito + pago + submit */}
      <div className="md:col-span-2 p-4 flex flex-col gap-3 bg-fm-surface-container-low/30">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">
          Items en esta factura
        </h3>
        {lines.length === 0 ? (
          <p className="text-xs text-fm-on-surface-variant italic">
            Tocá un item del catálogo a la izquierda para agregarlo.
          </p>
        ) : (
          <ul className="space-y-2 flex-1 overflow-y-auto max-h-[28vh]">
            {lines.map((line, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-2 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => patchLine(idx, { description: e.target.value })}
                    className="flex-1 text-xs px-2 py-1 bg-fm-background border border-fm-surface-container-high rounded"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    aria-label="Quitar"
                    className="text-fm-error hover:bg-fm-error/10 rounded p-1"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
                <div className="flex gap-2 items-center text-xs">
                  <label className="flex items-center gap-1">
                    <span className="text-fm-on-surface-variant">Cant.</span>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => patchLine(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                      className="w-14 px-2 py-1 bg-fm-background border border-fm-surface-container-high rounded tabular-nums"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-fm-on-surface-variant">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unit_price_usd}
                      onChange={(e) => patchLine(idx, { unit_price_usd: Number(e.target.value) })}
                      className="w-20 px-2 py-1 bg-fm-background border border-fm-surface-container-high rounded tabular-nums"
                    />
                  </label>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {fmt(line.quantity * line.unit_price_usd)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-fm-outline-variant/20">
          <span className="text-xs uppercase tracking-wider text-fm-on-surface-variant">Total</span>
          <span className="text-xl font-bold tabular-nums text-fm-primary">{fmt(subtotal)}</span>
        </div>

        <div className="space-y-2 pt-2 border-t border-fm-outline-variant/20">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={paymentNow} onChange={(e) => setPaymentNow(e.target.checked)} />
            Marcar como pagada al crear
          </label>
          {paymentNow && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="text-xs px-2 py-1.5 bg-fm-background border border-fm-surface-container-high rounded"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Referencia"
                className="text-xs px-2 py-1.5 bg-fm-background border border-fm-surface-container-high rounded"
              />
            </div>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas opcionales…"
            className="w-full text-xs px-2 py-1.5 bg-fm-background border border-fm-surface-container-high rounded"
          />
        </div>

        {error && (
          <div className="rounded bg-fm-error/10 px-2 py-1.5 text-xs text-fm-error">{error}</div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || lines.length === 0}
          className="mt-1 w-full px-4 py-2.5 text-sm rounded-xl bg-fm-primary text-white font-semibold disabled:opacity-60 hover:bg-fm-primary/90 transition-colors"
        >
          {isPending ? 'Creando…' : `Crear factura ${fmt(subtotal)}`}
        </button>
      </div>
    </div>
  )
}
