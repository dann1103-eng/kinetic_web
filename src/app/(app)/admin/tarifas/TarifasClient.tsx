'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  MORNING_PROGRAM_LABELS,
  type ServiceCatalogItem,
  type ServiceCategory,
} from '@/types/db'
import { groupByCategory } from '@/lib/domain/service-catalog'
import { setServiceCatalogActive } from '@/app/actions/service-catalog'
import { TarifaForm } from '@/components/tarifas/TarifaForm'

interface TarifasClientProps {
  items: ServiceCatalogItem[]
  canEdit: boolean
}

const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

function formatMonthRange(from: number | null, to: number | null): string {
  if (from === null || to === null) return '—'
  if (from === to) return MONTH_LABELS[from - 1]
  return `${MONTH_LABELS[from - 1]} – ${MONTH_LABELS[to - 1]}`
}

function formatPrice(usd: number): string {
  return `$${usd.toFixed(2)}`
}

export function TarifasClient({ items, canEdit }: TarifasClientProps) {
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | 'all'>(
    'all',
  )
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null)
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  const visibleItems = useMemo(
    () => (showInactive ? items : items.filter((i) => i.active)),
    [items, showInactive],
  )

  const grouped = useMemo(
    () => groupByCategory(visibleItems, { includeInactive: showInactive }),
    [visibleItems, showInactive],
  )

  const categoriesToRender =
    activeCategory === 'all'
      ? SERVICE_CATEGORY_ORDER.filter((c) => grouped[c]?.length)
      : grouped[activeCategory]?.length
        ? [activeCategory]
        : []

  const handleToggleActive = (item: ServiceCatalogItem) => {
    if (!canEdit) return
    startTransition(async () => {
      const res = await setServiceCatalogActive(item.id, !item.active)
      if (!res.ok) alert(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-12">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeCategory === 'all'
                ? 'bg-fm-primary text-white'
                : 'bg-fm-surface-container text-fm-on-surface-variant hover:bg-fm-surface-container-high'
            }`}
          >
            Todas
          </button>
          {SERVICE_CATEGORY_ORDER.map((cat) => {
            const count = grouped[cat]?.length ?? 0
            if (count === 0) return null
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-fm-primary text-white'
                    : 'bg-fm-surface-container text-fm-on-surface-variant hover:bg-fm-surface-container-high'
                }`}
              >
                {SERVICE_CATEGORY_LABELS[cat]}
                <span className="ml-2 text-xs opacity-70 tabular-nums">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fm-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-fm-outline-variant"
            />
            Ver inactivos
          </label>
          {canEdit && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-full bg-fm-primary text-white px-5 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              + Nueva tarifa
            </button>
          )}
        </div>
      </div>

      {/* Secciones por categoría */}
      {categoriesToRender.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 px-8 py-14 text-center">
          <p className="text-sm text-fm-on-surface-variant">
            No hay tarifas en esta categoría.
          </p>
        </div>
      ) : (
        categoriesToRender.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            items={grouped[cat] ?? []}
            canEdit={canEdit}
            onEdit={setEditing}
            onToggleActive={handleToggleActive}
          />
        ))
      )}

      {/* Modal de edición / creación */}
      {(editing || creating) && (
        <TarifaForm
          item={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

interface CategorySectionProps {
  category: ServiceCategory
  items: ServiceCatalogItem[]
  canEdit: boolean
  onEdit: (item: ServiceCatalogItem) => void
  onToggleActive: (item: ServiceCatalogItem) => void
}

function CategorySection({
  category,
  items,
  canEdit,
  onEdit,
  onToggleActive,
}: CategorySectionProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          {items.length} {items.length === 1 ? 'tarifa' : 'tarifas'}
        </p>
        <h2 className="text-2xl font-semibold text-fm-on-surface">
          {SERVICE_CATEGORY_LABELS[category]}
        </h2>
      </div>

      <div className="overflow-hidden rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fm-outline-variant/20 text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
              <th className="text-left px-6 py-3">Nombre</th>
              {category === 'mensualidad' && (
                <>
                  <th className="text-left px-4 py-3">Programa</th>
                  <th className="text-center px-4 py-3">Días/sem</th>
                </>
              )}
              {(category === 'matricula' || category === 'material_didactico') && (
                <th className="text-left px-4 py-3">Vigencia</th>
              )}
              {(category === 'evaluacion' ||
                category === 'evaluacion_dx_tea' ||
                category === 'evaluacion_psicologica' ||
                category === 'entrevista' ||
                category === 'asesoria') && (
                <th className="text-center px-4 py-3">Duración</th>
              )}
              <th className="text-right px-4 py-3">Precio</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Código</th>
              {canEdit && <th className="text-right px-6 py-3">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                className={`${
                  idx > 0 ? 'border-t border-fm-outline-variant/10' : ''
                } ${item.active ? '' : 'opacity-50'}`}
              >
                <td className="px-6 py-4">
                  <div className="font-medium text-fm-on-surface">
                    {item.name}
                    {!item.active && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-fm-on-surface-variant">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <div className="text-xs text-fm-on-surface-variant mt-0.5 max-w-md">
                      {item.description}
                    </div>
                  )}
                </td>
                {category === 'mensualidad' && (
                  <>
                    <td className="px-4 py-4 text-fm-on-surface-variant">
                      {item.morning_program
                        ? MORNING_PROGRAM_LABELS[item.morning_program]
                        : '—'}
                    </td>
                    <td className="px-4 py-4 text-center tabular-nums text-fm-on-surface-variant">
                      {item.days_per_week ?? '—'}
                    </td>
                  </>
                )}
                {(category === 'matricula' || category === 'material_didactico') && (
                  <td className="px-4 py-4 text-fm-on-surface-variant">
                    {formatMonthRange(item.applies_from_month, item.applies_to_month)}
                  </td>
                )}
                {(category === 'evaluacion' ||
                  category === 'evaluacion_dx_tea' ||
                  category === 'evaluacion_psicologica' ||
                  category === 'entrevista' ||
                  category === 'asesoria') && (
                  <td className="px-4 py-4 text-center tabular-nums text-fm-on-surface-variant">
                    {item.duration_minutes ? `${item.duration_minutes} min` : '—'}
                  </td>
                )}
                <td className="px-4 py-4 text-right font-semibold text-fm-on-surface tabular-nums">
                  {formatPrice(item.unit_price_usd)}
                </td>
                <td className="px-4 py-4 text-xs font-mono text-fm-on-surface-variant hidden md:table-cell">
                  {item.code}
                </td>
                {canEdit && (
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-xs font-semibold text-fm-primary hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onToggleActive(item)}
                        className="text-xs font-semibold text-fm-on-surface-variant hover:text-fm-error"
                      >
                        {item.active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
