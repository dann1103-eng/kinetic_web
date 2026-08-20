'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  updateServiceCatalogItem,
  setServiceCatalogActive,
} from '@/app/actions/service-catalog'
import { NewCatalogItemModal } from './NewCatalogItemModal'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  SERVICE_TYPE_LABELS,
  type ServiceCatalogItem,
  type ServiceCategory,
  type ServiceType,
} from '@/types/db'

type Tab = 'precios' | 'costos'

interface Props {
  items: ServiceCatalogItem[]
}

function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}

export function CatalogosClient({ items: initial }: Props) {
  const [tab, setTab] = useState<Tab>('precios')
  const [items, setItems] = useState<ServiceCatalogItem[]>(initial)
  const [showInactive, setShowInactive] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  const inactiveCount = useMemo(
    () => items.filter((i) => !i.active).length,
    [items],
  )

  // Un artículo desactivado equivale a eliminado: se esconde de la lista salvo
  // que se pidan explícitamente, para poder reactivarlo.
  const visible = useMemo(
    () => (showInactive ? items : items.filter((i) => i.active)),
    [items, showInactive],
  )

  // Categorías con costo interno (pago a quien realiza el servicio): no solo
  // terapias — también entrevistas, asesorías y evaluaciones de todo tipo.
  const costGrouped = useMemo(() => {
    const allowed = new Set<ServiceCategory>([
      'terapia_individual', 'entrevista', 'asesoria',
      'evaluacion', 'evaluacion_dx_tea', 'evaluacion_psicologica',
    ])
    const map = new Map<ServiceCategory, ServiceCatalogItem[]>()
    for (const it of visible) {
      if (!allowed.has(it.category)) continue
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    return SERVICE_CATEGORY_ORDER.filter((c) => map.has(c)).map(
      (c) => [c, map.get(c)!] as [ServiceCategory, ServiceCatalogItem[]],
    )
  }, [visible])

  // Agrupar por categoría para la pestaña de precios, en el orden estable.
  const grouped = useMemo(() => {
    const map = new Map<ServiceCategory, ServiceCatalogItem[]>()
    for (const it of visible) {
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    for (const rows of map.values()) {
      rows.sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'),
      )
    }
    return SERVICE_CATEGORY_ORDER.filter((c) => map.has(c)).map(
      (c) => [c, map.get(c)!] as [ServiceCategory, ServiceCatalogItem[]],
    )
  }, [visible])

  function applyLocal(updated: ServiceCatalogItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  return (
    <div className="space-y-5">
      {/* Tabs + acciones */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fm-outline-variant/20">
        <div className="flex gap-1">
          <TabButton active={tab === 'precios'} onClick={() => setTab('precios')}>
            Precios (cobro)
          </TabButton>
          <TabButton active={tab === 'costos'} onClick={() => setTab('costos')}>
            Costos (pago a terapista)
          </TabButton>
        </div>
        <div className="flex items-center gap-3 pb-2">
          <label className="flex items-center gap-1.5 text-xs text-fm-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar inactivos
            {inactiveCount > 0 && !showInactive && ` (${inactiveCount})`}
          </label>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fm-primary text-white text-sm font-medium hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base leading-none">add</span>
            Nuevo artículo
          </button>
        </div>
      </div>

      <NewCatalogItemModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        items={items}
        onCreated={(created) => setItems((prev) => [...prev, created])}
      />

      {tab === 'precios' ? (
        <div className="space-y-6">
          <p className="text-xs text-fm-on-surface-variant">
            Precios que se cobran a las familias. <b>Precio BK</b> = tarifa con descuento
            para niños en programa matutino (Blue Kids / Learning Kids / Aula).
            <b> Quitar</b> no borra el artículo: lo esconde y podés reactivarlo.
          </p>
          {grouped.length === 0 && (
            <p className="text-sm text-fm-on-surface-variant">
              No hay artículos activos en el catálogo.
            </p>
          )}
          {grouped.map(([cat, rows]) => (
            <section key={cat} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                {SERVICE_CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Servicio</th>
                      <th className="text-right px-3 py-2 font-semibold w-28">Precio</th>
                      <th className="text-right px-3 py-2 font-semibold w-28">Precio BK</th>
                      <th className="text-center px-3 py-2 font-semibold w-20">Estado</th>
                      <th className="w-44" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => (
                      <PriceRow key={it.id} item={it} onSaved={applyLocal} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-fm-on-surface-variant">
            Costo interno (lo que se le paga a quien realiza el servicio). Alimenta la planilla
            de servicios profesionales y las terapias extra de contratos mensuales fijos.
          </p>
          {costGrouped.length === 0 ? (
            <p className="text-sm text-fm-on-surface-variant">
              No hay servicios con costo en el catálogo.
            </p>
          ) : (
            costGrouped.map(([cat, rows]) => (
              <section key={cat} className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                  {SERVICE_CATEGORY_LABELS[cat] ?? cat}
                </h3>
                <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Servicio</th>
                        <th className="text-right px-3 py-2 font-semibold w-28">Precio cobro</th>
                        <th className="text-right px-3 py-2 font-semibold w-32">Costo interno</th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((it) => (
                        <CostRow key={it.id} item={it} onSaved={applyLocal} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active
          ? 'border-fm-primary text-fm-primary'
          : 'border-transparent text-fm-on-surface-variant hover:text-fm-on-surface'
      }`}
    >
      {children}
    </button>
  )
}

function PriceRow({
  item,
  onSaved,
}: {
  item: ServiceCatalogItem
  onSaved: (i: ServiceCatalogItem) => void
}) {
  const [price, setPrice] = useState(item.unit_price_usd?.toString() ?? '0')
  const [priceBk, setPriceBk] = useState(item.unit_price_bk_usd?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const dirty =
    Number(price) !== Number(item.unit_price_usd ?? 0) ||
    (priceBk.trim() === '' ? item.unit_price_bk_usd != null : Number(priceBk) !== Number(item.unit_price_bk_usd ?? NaN))

  function save() {
    setError(null)
    start(async () => {
      const res = await updateServiceCatalogItem(item.id, {
        unit_price_usd: Number(price) || 0,
        unit_price_bk_usd: priceBk.trim() === '' ? null : Number(priceBk),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved(res.data)
    })
  }

  function toggleActive() {
    if (
      item.active &&
      !window.confirm(
        `¿Quitar "${item.name}" del catálogo?\n\n` +
          'Deja de aparecer al agendar y al cobrar, pero no se borra: las citas y ' +
          'facturas que ya lo usaron lo conservan, y podés reactivarlo cuando quieras ' +
          'con "Mostrar inactivos".',
      )
    ) {
      return
    }
    setError(null)
    start(async () => {
      const res = await setServiceCatalogActive(item.id, !item.active)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved(res.data)
    })
  }

  return (
    <tr className={`border-t border-fm-outline-variant/15 ${item.active ? '' : 'opacity-50'}`}>
      <td className="px-3 py-1.5">
        <div className="font-medium text-fm-on-surface">{item.name}</div>
        <div className="text-[10px] font-mono text-fm-on-surface-variant">{item.code}</div>
        {error && <div className="text-[10px] text-red-600 mt-0.5">{error}</div>}
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumInput value={price} onChange={setPrice} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumInput value={priceBk} onChange={setPriceBk} placeholder="—" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <span
          className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${
            item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
          }`}
        >
          {item.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="text-xs px-2.5 py-1 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60 mr-1.5"
          >
            {isPending ? '…' : 'Guardar'}
          </button>
        )}
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className={`text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-60 ${
            item.active
              ? 'text-fm-error hover:bg-red-50'
              : 'text-fm-primary hover:bg-fm-surface-container-low'
          }`}
        >
          {item.active ? 'Quitar' : 'Reactivar'}
        </button>
      </td>
    </tr>
  )
}

function CostRow({
  item,
  onSaved,
}: {
  item: ServiceCatalogItem
  onSaved: (i: ServiceCatalogItem) => void
}) {
  const [cost, setCost] = useState(item.cost_usd?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const dirty =
    cost.trim() === '' ? item.cost_usd != null : Number(cost) !== Number(item.cost_usd ?? NaN)

  function save() {
    setError(null)
    start(async () => {
      const res = await updateServiceCatalogItem(item.id, {
        cost_usd: cost.trim() === '' ? null : Number(cost),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved(res.data)
    })
  }

  const svcLabel = item.service_type
    ? SERVICE_TYPE_LABELS[item.service_type as ServiceType] ?? item.service_type
    : null

  return (
    <tr className="border-t border-fm-outline-variant/15">
      <td className="px-3 py-1.5">
        <div className="font-medium text-fm-on-surface">{item.name}</div>
        {svcLabel && (
          <div className="text-[10px] text-fm-on-surface-variant">{svcLabel}</div>
        )}
        {error && <div className="text-[10px] text-red-600 mt-0.5">{error}</div>}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-fm-on-surface-variant">
        {money(item.unit_price_usd)}
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumInput value={cost} onChange={setCost} placeholder="—" />
      </td>
      <td className="px-3 py-1.5 text-right">
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="text-xs px-2.5 py-1 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? '…' : 'Guardar'}
          </button>
        )}
      </td>
    </tr>
  )
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-fm-on-surface-variant text-xs">$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm text-right tabular-nums"
      />
    </div>
  )
}
