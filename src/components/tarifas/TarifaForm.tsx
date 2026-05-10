'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  MORNING_PROGRAM_LABELS,
  type MorningProgram,
  type ServiceCatalogItem,
  type ServiceCategory,
} from '@/types/db'
import {
  createServiceCatalogItem,
  updateServiceCatalogItem,
  type ServiceCatalogInput,
} from '@/app/actions/service-catalog'

interface TarifaFormProps {
  item: ServiceCatalogItem | null
  onClose: () => void
  onSaved: () => void
}

const PRORATION_GROUP_OPTIONS = [
  { value: '', label: '— ninguno —' },
  { value: 'matricula_bk_lk', label: 'Matrícula Blue Kids / Learning Kids' },
  { value: 'matricula_ae', label: 'Matrícula Aula Educativa' },
  { value: 'material_bk_ae', label: 'Material didáctico (BK/LK/AE)' },
]

export function TarifaForm({ item, onClose, onSaved }: TarifaFormProps) {
  const isEdit = item !== null
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState(item?.code ?? '')
  const [category, setCategory] = useState<ServiceCategory>(
    item?.category ?? 'evaluacion',
  )
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [unitPrice, setUnitPrice] = useState(
    item ? String(item.unit_price_usd) : '',
  )
  const [durationMinutes, setDurationMinutes] = useState(
    item?.duration_minutes ? String(item.duration_minutes) : '',
  )
  const [morningProgram, setMorningProgram] = useState<MorningProgram | ''>(
    item?.morning_program ?? '',
  )
  const [daysPerWeek, setDaysPerWeek] = useState(
    item?.days_per_week ? String(item.days_per_week) : '',
  )
  const [prorationGroup, setProrationGroup] = useState(
    item?.proration_group ?? '',
  )
  const [appliesFromMonth, setAppliesFromMonth] = useState(
    item?.applies_from_month ? String(item.applies_from_month) : '',
  )
  const [appliesToMonth, setAppliesToMonth] = useState(
    item?.applies_to_month ? String(item.applies_to_month) : '',
  )
  const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? 0))
  const [notes, setNotes] = useState(item?.notes ?? '')

  const isMensualidad = category === 'mensualidad'
  const isProrateable = !!prorationGroup

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const input: ServiceCatalogInput = {
      code: code.trim(),
      category,
      name: name.trim(),
      description: description.trim() || null,
      unit_price_usd: parseFloat(unitPrice) || 0,
      duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
      morning_program: isMensualidad
        ? (morningProgram as MorningProgram) || null
        : null,
      days_per_week:
        isMensualidad && daysPerWeek ? parseInt(daysPerWeek, 10) : null,
      proration_group: prorationGroup || null,
      applies_from_month:
        isProrateable && appliesFromMonth
          ? parseInt(appliesFromMonth, 10)
          : null,
      applies_to_month:
        isProrateable && appliesToMonth ? parseInt(appliesToMonth, 10) : null,
      sort_order: parseInt(sortOrder, 10) || 0,
      notes: notes.trim() || null,
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateServiceCatalogItem(item!.id, input)
        : await createServiceCatalogItem(input)
      if (!res.ok) setError(res.error)
      else onSaved()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar tarifa' : 'Nueva tarifa'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Editando "${item.name}"`
              : 'Agregar un nuevo item al catálogo de servicios.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Código + categoría */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código (snake_case)">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isEdit}
                required
                pattern="[a-z0-9_]+"
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm font-mono disabled:opacity-50"
                placeholder="eval_neuromotor"
              />
            </Field>
            <Field label="Categoría">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
              >
                {SERVICE_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {SERVICE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Nombre */}
          <Field label="Nombre visible">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
              placeholder="Evaluación Neuromotor"
            />
          </Field>

          {/* Descripción */}
          <Field label="Descripción (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
            />
          </Field>

          {/* Precio + duración */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio USD">
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Duración (minutos, opcional)">
              <input
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
              />
            </Field>
          </div>

          {/* Mensualidad: programa + días */}
          {isMensualidad && (
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-fm-surface-container-low border border-fm-outline-variant/20">
              <Field label="Programa">
                <select
                  value={morningProgram}
                  onChange={(e) =>
                    setMorningProgram(e.target.value as MorningProgram | '')
                  }
                  required
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
                >
                  <option value="">— elegir —</option>
                  {Object.entries(MORNING_PROGRAM_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Días por semana">
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  required
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
                />
              </Field>
            </div>
          )}

          {/* Prorrateo */}
          <div className="space-y-3 p-4 rounded-2xl bg-fm-surface-container-low border border-fm-outline-variant/20">
            <Field label="Grupo de prorrateo (matrícula / material)">
              <select
                value={prorationGroup}
                onChange={(e) => setProrationGroup(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
              >
                {PRORATION_GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {isProrateable && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mes desde (1-12)">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={appliesFromMonth}
                    onChange={(e) => setAppliesFromMonth(e.target.value)}
                    required
                    className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
                  />
                </Field>
                <Field label="Mes hasta (1-12)">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={appliesToMonth}
                    onChange={(e) => setAppliesToMonth(e.target.value)}
                    required
                    className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Orden + notas */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sort order">
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Notas internas (opcional)">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </div>

          {error && (
            <p className="text-sm text-fm-error bg-fm-error/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-fm-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-fm-primary text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tarifa'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}
