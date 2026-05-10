'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatCurrency, type LineItemInput } from '@/lib/domain/invoices'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  type ServiceCatalogItem,
} from '@/types/db'
import { groupByCategory, searchItems } from '@/lib/domain/service-catalog'

interface LineItemsEditorProps {
  items: LineItemInput[]
  onChange: (items: LineItemInput[]) => void
  disabled?: boolean
  catalog?: ServiceCatalogItem[]
}

export function LineItemsEditor({
  items,
  onChange,
  disabled,
  catalog = [],
}: LineItemsEditorProps) {
  const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null)

  function update(idx: number, patch: Partial<LineItemInput>) {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange(next)
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function add() {
    onChange([
      ...items,
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        service_catalog_id: null,
        service_code: null,
      },
    ])
  }
  function applyCatalogItem(idx: number, item: ServiceCatalogItem) {
    update(idx, {
      description: item.name,
      unit_price: item.unit_price_usd,
      service_catalog_id: item.id,
      service_code: item.code,
    })
    setPickerOpenIdx(null)
  }
  function clearCatalogLink(idx: number) {
    update(idx, { service_catalog_id: null, service_code: null })
  }

  const hasCatalog = catalog.length > 0

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_70px_120px_120px_32px] gap-2 text-[10px] font-semibold text-fm-outline-variant uppercase tracking-wider px-1">
        <span>Descripción</span>
        <span className="text-right">Cant.</span>
        <span className="text-right">Precio unit.</span>
        <span className="text-right">Total línea</span>
        <span></span>
      </div>
      {items.map((it, idx) => {
        const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
        const linkedCode = it.service_code
        return (
          <div key={idx} className="space-y-1">
            <div className="grid grid-cols-[1fr_70px_120px_120px_32px] gap-2 items-center">
              <Input
                value={it.description}
                disabled={disabled}
                onChange={(e) =>
                  update(idx, {
                    description: e.target.value,
                    // Romper el link si el admin edita la descripción manualmente
                    service_catalog_id: linkedCode
                      ? null
                      : it.service_catalog_id,
                    service_code: linkedCode ? null : it.service_code,
                  })
                }
                placeholder="Concepto cobrado"
                className="rounded-lg bg-fm-background border-fm-surface-container-high h-9 text-sm"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={it.quantity}
                disabled={disabled}
                onChange={(e) =>
                  update(idx, {
                    quantity: parseFloat(e.target.value) || 0,
                  })
                }
                className="rounded-lg bg-fm-background border-fm-surface-container-high h-9 text-sm text-right"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={it.unit_price}
                disabled={disabled}
                onChange={(e) =>
                  update(idx, {
                    unit_price: parseFloat(e.target.value) || 0,
                  })
                }
                className="rounded-lg bg-fm-background border-fm-surface-container-high h-9 text-sm text-right"
              />
              <div className="h-9 flex items-center justify-end text-sm font-semibold text-fm-on-surface pr-2">
                {formatCurrency(line)}
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={disabled}
                className="h-9 w-9 rounded-lg text-fm-error opacity-60 hover:opacity-100 hover:bg-fm-error/5 flex items-center justify-center"
                aria-label="Eliminar línea"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  delete
                </span>
              </button>
            </div>
            {hasCatalog && (
              <div className="flex items-center gap-2 px-1 text-xs">
                {linkedCode ? (
                  <>
                    <span className="text-fm-on-surface-variant">
                      Catálogo:{' '}
                      <span className="font-mono">{linkedCode}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => clearCatalogLink(idx)}
                      disabled={disabled}
                      className="text-fm-error hover:underline"
                    >
                      Quitar vínculo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setPickerOpenIdx(pickerOpenIdx === idx ? null : idx)
                    }
                    disabled={disabled}
                    className="text-fm-primary hover:underline font-semibold"
                  >
                    {pickerOpenIdx === idx
                      ? 'Cerrar selector'
                      : '+ Seleccionar del catálogo'}
                  </button>
                )}
              </div>
            )}
            {pickerOpenIdx === idx && (
              <CatalogPicker
                items={catalog}
                onSelect={(item) => applyCatalogItem(idx, item)}
                onClose={() => setPickerOpenIdx(null)}
              />
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="w-full h-9 rounded-lg border border-dashed border-fm-primary/40 text-fm-primary text-sm font-semibold hover:bg-fm-primary/5"
      >
        + Agregar línea
      </button>
    </div>
  )
}

interface CatalogPickerProps {
  items: ServiceCatalogItem[]
  onSelect: (item: ServiceCatalogItem) => void
  onClose: () => void
}

function CatalogPicker({ items, onSelect, onClose }: CatalogPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const active = items.filter((i) => i.active)
    return searchItems(active, query).slice(0, 50)
  }, [items, query])

  const grouped = useMemo(
    () => groupByCategory(filtered),
    [filtered],
  )

  return (
    <div className="rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest shadow-md p-3 space-y-2 max-h-[360px] overflow-hidden flex flex-col">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en el catálogo (ej. WISC, mensualidad, matrícula)…"
          className="flex-1 rounded-lg bg-fm-background border-fm-surface-container-high h-9 text-sm"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-fm-on-surface-variant hover:text-fm-on-surface"
        >
          Cerrar
        </button>
      </div>
      <div className="overflow-y-auto flex-1 space-y-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-fm-on-surface-variant text-center py-4">
            Sin resultados.
          </p>
        ) : (
          SERVICE_CATEGORY_ORDER.filter((c) => grouped[c]?.length).map(
            (cat) => (
              <div key={cat}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant px-2 py-1">
                  {SERVICE_CATEGORY_LABELS[cat]}
                </p>
                <ul className="space-y-0.5">
                  {grouped[cat].map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-left text-sm hover:bg-fm-primary/5"
                      >
                        <span className="text-fm-on-surface truncate">
                          {item.name}
                        </span>
                        <span className="font-semibold text-fm-on-surface tabular-nums shrink-0">
                          ${item.unit_price_usd.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )
        )}
      </div>
    </div>
  )
}
