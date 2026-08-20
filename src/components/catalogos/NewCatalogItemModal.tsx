'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createServiceCatalogItem } from '@/app/actions/service-catalog'
import {
  categoryFieldRules,
  nextSortOrder,
  slugifyCatalogCode,
} from '@/lib/domain/service-catalog'
import {
  MORNING_PROGRAM_LABELS,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ORDER,
  SERVICE_TYPE_LABELS,
  type MorningProgram,
  type ServiceCatalogItem,
  type ServiceCategory,
  type ServiceType,
} from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  /** Catálogo completo — para calcular el orden y listar grupos de prorrateo. */
  items: ServiceCatalogItem[]
  onCreated: (item: ServiceCatalogItem) => void
}

const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS) as [
  ServiceType,
  string,
][]

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function NewCatalogItemModal({ open, onClose, items, onCreated }: Props) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<ServiceCategory>('evaluacion')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [price, setPrice] = useState('')
  const [priceBk, setPriceBk] = useState('')
  const [cost, setCost] = useState('')
  const [duration, setDuration] = useState('')
  const [description, setDescription] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType>('lenguaje')
  const [program, setProgram] = useState<MorningProgram>('blue_kids')
  const [daysPerWeek, setDaysPerWeek] = useState('2')
  const [prorationGroup, setProrationGroup] = useState('')
  const [fromMonth, setFromMonth] = useState('1')
  const [toMonth, setToMonth] = useState('12')

  const rules = categoryFieldRules(category)

  // El código se propone desde el nombre hasta que alguien lo edite a mano.
  const effectiveCode = codeTouched ? code : slugifyCatalogCode(name)

  // Solo los grupos de prorrateo que YA existen: `findMatriculaForMonth` y
  // `findMaterialForMonth` buscan por nombre de grupo fijo, así que inventar uno
  // nuevo crearía un item que nada lee.
  const prorationGroups = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) {
      if (i.proration_group) set.add(i.proration_group)
    }
    return Array.from(set).sort()
  }, [items])

  function reset() {
    setCategory('evaluacion')
    setName('')
    setCode('')
    setCodeTouched(false)
    setPrice('')
    setPriceBk('')
    setCost('')
    setDuration('')
    setDescription('')
    setServiceType('lenguaje')
    setProgram('blue_kids')
    setDaysPerWeek('2')
    setProrationGroup('')
    setFromMonth('1')
    setToMonth('12')
    setError(null)
  }

  /** Espejo de la validación del servidor, para avisar antes de mandar. */
  function localError(): string | null {
    if (!name.trim()) return 'El nombre es obligatorio.'
    if (!effectiveCode) {
      return 'No se pudo generar un código desde el nombre. Escribí uno a mano (minúsculas, números y guion bajo).'
    }
    if (!/^[a-z0-9_]+$/.test(effectiveCode)) {
      return 'El código solo admite minúsculas, números y guion bajo.'
    }
    if (items.some((i) => i.code === effectiveCode)) {
      return `Ya existe un artículo con el código "${effectiveCode}".`
    }
    if (price.trim() === '' || Number.isNaN(Number(price)) || Number(price) < 0) {
      return 'El precio es obligatorio y no puede ser negativo.'
    }
    if (rules.needsProgram) {
      const d = Number(daysPerWeek)
      if (!d || d < 1 || d > 7) return 'Días por semana debe estar entre 1 y 7.'
      const dupe = items.find(
        (i) =>
          i.active &&
          i.category === 'mensualidad' &&
          i.morning_program === program &&
          i.days_per_week === d,
      )
      if (dupe) {
        return `Ya hay una mensualidad activa de ${MORNING_PROGRAM_LABELS[program]} con ${d} días/semana ("${dupe.name}"). Desactivala o editá su precio.`
      }
    }
    if (prorationGroup && Number(fromMonth) > Number(toMonth)) {
      return 'El mes de inicio debe ser anterior o igual al mes de fin.'
    }
    return null
  }

  function handleSubmit() {
    const invalid = localError()
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    start(async () => {
      const res = await createServiceCatalogItem({
        code: effectiveCode,
        category,
        name: name.trim(),
        description: description.trim() || null,
        unit_price_usd: Number(price),
        unit_price_bk_usd: priceBk.trim() === '' ? null : Number(priceBk),
        cost_usd: cost.trim() === '' ? null : Number(cost),
        service_type: rules.needsServiceType ? serviceType : null,
        duration_minutes: duration.trim() === '' ? null : Number(duration),
        morning_program: rules.needsProgram ? program : null,
        days_per_week: rules.needsProgram ? Number(daysPerWeek) : null,
        proration_group: rules.allowsProration && prorationGroup ? prorationGroup : null,
        applies_from_month:
          rules.allowsProration && prorationGroup ? Number(fromMonth) : null,
        applies_to_month:
          rules.allowsProration && prorationGroup ? Number(toMonth) : null,
        active: true,
        sort_order: nextSortOrder(items, category),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onCreated(res.data)
      reset()
      onClose()
      router.refresh()
    })
  }

  function handleClose() {
    if (isPending) return
    if (
      name.trim() &&
      !window.confirm('Este artículo todavía no se ha guardado. ¿Cerrar de todas formas?')
    ) {
      return
    }
    reset()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-fm-on-surface">Nuevo artículo</h3>
            <p className="text-xs text-fm-on-surface-variant mt-1">
              Agregar un servicio, evaluación o artículo al catálogo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-fm-on-surface-variant hover:text-fm-on-surface"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Categoría *">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ServiceCategory)}
              className={inputClass}
            >
              {SERVICE_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {SERVICE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nombre *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Evaluación de lenguaje"
              className={inputClass}
            />
          </Field>

          <Field label="Código" className="md:col-span-2">
            <input
              type="text"
              value={effectiveCode}
              onChange={(e) => {
                setCodeTouched(true)
                setCode(e.target.value)
              }}
              placeholder="se genera del nombre"
              className={`${inputClass} font-mono`}
            />
            <p className="text-[10px] text-fm-on-surface-variant mt-1">
              Identificador interno. Se genera solo desde el nombre; editalo únicamente
              si necesitás uno específico. No se puede repetir.
            </p>
          </Field>

          {rules.needsServiceType && (
            <Field label="Tipo de terapia *" className="md:col-span-2">
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
                className={inputClass}
              >
                {SERVICE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-fm-on-surface-variant mt-1">
                Enlaza el precio con el tipo de terapia que se elige en el plan.
              </p>
            </Field>
          )}

          {rules.needsProgram && (
            <>
              <Field label="Programa *">
                <select
                  value={program}
                  onChange={(e) => setProgram(e.target.value as MorningProgram)}
                  className={inputClass}
                >
                  {(Object.keys(MORNING_PROGRAM_LABELS) as MorningProgram[]).map((p) => (
                    <option key={p} value={p}>
                      {MORNING_PROGRAM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Días por semana *">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          <Field label="Precio (cobro a la familia) *">
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </Field>

          <Field label="Precio BK (opcional)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceBk}
              onChange={(e) => setPriceBk(e.target.value)}
              placeholder="sin descuento"
              className={inputClass}
            />
          </Field>

          <Field label="Costo interno (opcional)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
            <p className="text-[10px] text-fm-on-surface-variant mt-1">
              Lo que se le paga a quien realiza el servicio.
            </p>
          </Field>

          <Field label="Duración (minutos, opcional)">
            <input
              type="number"
              min={0}
              step="5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </Field>

          {rules.allowsProration && prorationGroups.length > 0 && (
            <>
              <Field label="Grupo de prorrateo (opcional)" className="md:col-span-2">
                <select
                  value={prorationGroup}
                  onChange={(e) => setProrationGroup(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sin prorrateo (precio fijo todo el año)</option>
                  {prorationGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-fm-on-surface-variant mt-1">
                  Usalo para precios que cambian según el mes de ingreso. Solo se
                  pueden usar los grupos que ya existen.
                </p>
              </Field>
              {prorationGroup && (
                <>
                  <Field label="Aplica desde el mes *">
                    <select
                      value={fromMonth}
                      onChange={(e) => setFromMonth(e.target.value)}
                      className={inputClass}
                    >
                      {MONTH_LABELS.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Hasta el mes *">
                    <select
                      value={toMonth}
                      onChange={(e) => setToMonth(e.target.value)}
                      className={inputClass}
                    >
                      {MONTH_LABELS.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </>
          )}

          <Field label="Descripción (opcional)" className="md:col-span-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <footer className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container-low disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-1.5 rounded-lg bg-fm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Guardando…' : 'Crear artículo'}
          </button>
        </footer>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm'

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
