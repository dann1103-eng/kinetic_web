'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addInstitutionalClosure,
  removeInstitutionalClosure,
} from '@/app/actions/institutional-calendar'
import { INSTITUTIONAL_CLOSURE_TYPE_LABELS } from '@/types/db'
import type { InstitutionalClosure, InstitutionalClosureType } from '@/types/db'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const TYPES: InstitutionalClosureType[] = ['holiday', 'closure', 'gov_decree', 'kinetic_break']

const TYPE_CHIP: Record<InstitutionalClosureType, string> = {
  holiday: 'bg-red-100 text-red-700',
  closure: 'bg-amber-100 text-amber-800',
  gov_decree: 'bg-blue-100 text-blue-700',
  kinetic_break: 'bg-fm-primary/10 text-fm-primary',
}

interface Props {
  year: number
  closures: InstitutionalClosure[]
  canEdit: boolean
  canDelete: boolean
}

export function CalendarioInstitucionalClient({ year, closures, canEdit, canDelete }: Props) {
  const router = useRouter()
  const [date, setDate] = useState(`${year}-01-01`)
  const [type, setType] = useState<InstitutionalClosureType>('holiday')
  const [name, setName] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Meses del año sin ningún cierre cargado. Es la señal que faltaba: un mes en
  // blanco acá significa que los ciclos de ese mes van a agendar y COBRAR los
  // asuetos como días normales.
  const emptyMonths = useMemo(() => {
    const withClosures = new Set(closures.map((c) => Number(c.date.slice(5, 7))))
    return MONTHS.map((label, i) => ({ label, month: i + 1 })).filter(
      (m) => !withClosures.has(m.month),
    )
  }, [closures])

  const byMonth = useMemo(() => {
    const map = new Map<number, InstitutionalClosure[]>()
    for (const c of closures) {
      const m = Number(c.date.slice(5, 7))
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(c)
    }
    return map
  }, [closures])

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Escribí el nombre del asueto o cierre.')
      return
    }
    setError(null)
    startSave(async () => {
      const res = await addInstitutionalClosure({
        date,
        type,
        name: name.trim(),
        all_day: true,
        year_recurring: recurring,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setName('')
      router.refresh()
    })
  }

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`¿Quitar "${label}" del calendario institucional?`)) return
    setDeletingId(id)
    startSave(async () => {
      const res = await removeInstitutionalClosure(id)
      if (!res.ok) setError(res.error)
      setDeletingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {emptyMonths.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">
            {emptyMonths.length === 12
              ? `No hay ningún asueto cargado en ${year}.`
              : `Sin asuetos cargados en ${emptyMonths.length} mes(es) de ${year}: ${emptyMonths.map((m) => m.label).join(', ')}.`}
          </p>
          <p className="mt-0.5">
            Un mes sin cierres cargados se agenda completo: los ciclos van a proponer{' '}
            <b>y cobrar</b> los días de asueto como cualquier otro. Cargalos antes de generar los
            ciclos del mes.
          </p>
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-fm-outline-variant/20 p-3 flex flex-wrap items-end gap-3"
        >
          <label className="text-sm">
            <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">Fecha</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InstitutionalClosureType)}
              className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {INSTITUTIONAL_CLOSURE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm flex-1 min-w-[200px]">
            <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">
              Nombre
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Fiestas Agostinas"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-fm-on-surface pb-2">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            Se repite cada año
          </label>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {closures.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant">
          El calendario de {year} está vacío.
        </p>
      ) : (
        <div className="space-y-4">
          {MONTHS.map((label, i) => {
            const items = byMonth.get(i + 1)
            if (!items || items.length === 0) return null
            return (
              <div key={label}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-1">
                  {label}
                </h2>
                <ul className="divide-y divide-fm-outline-variant/10 rounded-lg border border-fm-outline-variant/20">
                  {items.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="tabular-nums text-fm-on-surface-variant w-12">
                        {c.date.slice(8, 10)}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_CHIP[c.type]}`}
                      >
                        {INSTITUTIONAL_CLOSURE_TYPE_LABELS[c.type]}
                      </span>
                      <span className="flex-1 text-fm-on-surface">{c.name}</span>
                      {c.year_recurring && (
                        <span className="text-[10px] text-fm-on-surface-variant">anual</span>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id, c.name)}
                          disabled={deletingId === c.id}
                          className="text-fm-on-surface-variant hover:text-fm-error disabled:opacity-40"
                          aria-label="Quitar"
                          title="Quitar del calendario"
                        >
                          <span className="material-symbols-outlined text-base align-middle">
                            close
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
