'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NinoCard } from './NinoCard'
import type { NinoCardData } from '@/lib/domain/ninos-dashboard'
import type { IntakePhaseCatalogEntry, MorningProgram } from '@/types/db'

interface Props {
  niños: NinoCardData[]
  /** Terapistas referenciados por algún plan, para el filtro. */
  therapists: { id: string; full_name: string }[]
  periodMonth: string       // 'YYYY-MM' activo
  availableMonths: string[]
  phaseCatalog: IntakePhaseCatalogEntry[]
  /** Valores iniciales de los filtros, leídos de la URL (para conservarlos
   * al regresar desde el perfil de un niño). */
  initialSearch: string
  initialPhase: string
  initialProgram: string
  initialTherapist: string
}

// Grupos por programa para la vista seccionada (sin filtros activos).
// Orden: programas primero, "Solo terapias" al final.
const PROGRAM_GROUPS: { key: MorningProgram | null; label: string }[] = [
  { key: 'blue_kids', label: 'BlueKids' },
  { key: 'learning_kids', label: 'LearningKids' },
  { key: 'aula_educativa', label: 'Aula Educativa' },
  { key: null, label: 'Solo terapias' },
]

function monthLabel(ym: string): string {
  return new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

// Filtros por grupo del pipeline (mig 0121). Reemplaza el viejo filtro
// por treatment_status que ya no existe.
const PHASE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todas las fases' },
  { value: 'group_1', label: '1 · Primer contacto' },
  { value: 'group_2', label: '2 · Proceso de Admisión' },
  { value: 'group_3', label: '3 · Inicio Terapéutico' },
  { value: 'group_4', label: '4 · Seguimiento' },
  { value: 'group_5', label: '5 · Cierre' },
  { value: 'active', label: 'Activos (en terapia o seguimiento)' },
  { value: 'closed', label: 'Cerrados (alta o retiro)' },
]

const PROGRAM_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos los programas' },
  { value: 'none', label: 'Solo terapias (sin programa)' },
  { value: 'blue_kids', label: 'BlueKids' },
  { value: 'learning_kids', label: 'LearningKids' },
  { value: 'aula_educativa', label: 'Aula Educativa' },
]

const SELECT_CLASS =
  'text-sm border border-fm-outline-variant/30 rounded-xl px-3 py-1.5 bg-fm-surface-container-lowest text-fm-on-surface capitalize focus:outline-none focus:ring-2 focus:ring-fm-primary/40'

function phaseMatchesFilter(phaseCode: string | null, filter: string): boolean {
  if (filter === 'all') return true
  if (!phaseCode) return false
  if (filter.startsWith('group_')) {
    const n = filter.slice(6)
    return phaseCode.startsWith(`${n}_`)
  }
  if (filter === 'active') {
    return phaseCode === '3_3_activo_en_terapias' || phaseCode.startsWith('4_')
  }
  if (filter === 'closed') {
    return phaseCode === '5_1_alta_terapeutica' || phaseCode === '5_2_retirado'
  }
  return true
}

export function NinosPageClient({
  niños,
  therapists,
  periodMonth,
  availableMonths,
  phaseCatalog,
  initialSearch,
  initialPhase,
  initialProgram,
  initialTherapist,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [phaseFilter, setPhaseFilter] = useState<string>(initialPhase)
  const [programFilter, setProgramFilter] = useState<string>(initialProgram)
  const [therapistFilter, setTherapistFilter] = useState<string>(initialTherapist)

  // Query string que refleja el estado actual (mes + filtros). Lo usamos para:
  //  1) sincronizar la URL (sin refetch del server) vía history.replaceState
  //  2) construir el returnTo de cada card → "Regresar" vuelve a /niños igual.
  function buildQuery(next: {
    search: string
    phase: string
    program: string
    therapist: string
  }): string {
    const params = new URLSearchParams()
    params.set('month', periodMonth)
    if (next.search) params.set('q', next.search)
    if (next.phase !== 'all') params.set('phase', next.phase)
    if (next.program !== 'all') params.set('program', next.program)
    if (next.therapist !== 'all') params.set('therapist', next.therapist)
    return params.toString()
  }

  // Sincroniza la URL sin disparar un refetch del Server Component (a
  // diferencia del selector de mes, los demás filtros son client-side).
  function syncUrl(next: {
    search: string
    phase: string
    program: string
    therapist: string
  }) {
    window.history.replaceState(null, '', `/ninos?${buildQuery(next)}`)
  }

  const currentState = { search, phase: phaseFilter, program: programFilter, therapist: therapistFilter }
  const returnTo = `/ninos?${buildQuery(currentState)}`

  const filtered = niños.filter((d) => {
    if (search && !d.child.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (!phaseMatchesFilter(d.child.current_phase_code, phaseFilter)) return false
    if (programFilter !== 'all') {
      if (programFilter === 'none' && d.child.enrolled_program !== null) return false
      if (programFilter !== 'none' && d.child.enrolled_program !== (programFilter as MorningProgram)) {
        return false
      }
    }
    if (therapistFilter !== 'all' && !d.therapistIds.includes(therapistFilter)) return false
    return true
  })

  // Sin filtros → vista seccionada por programa (cada grupo conserva el orden
  // alfabético por apellido que ya trae `niños`).
  const noFilters =
    search === '' && phaseFilter === 'all' && programFilter === 'all' && therapistFilter === 'all'

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Selector de mes (URL-driven → server refetch) */}
        <select
          value={periodMonth}
          onChange={(e) => {
            // El mes sí requiere refetch del server (cambia asistencia/ciclo);
            // arrastramos los demás filtros para no perderlos.
            const params = new URLSearchParams(buildQuery(currentState))
            params.set('month', e.target.value)
            router.push(`/ninos?${params.toString()}`)
          }}
          className={SELECT_CLASS}
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>

        {/* Búsqueda */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-fm-outline text-base pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar niño…"
            value={search}
            onChange={(e) => {
              const v = e.target.value
              setSearch(v)
              syncUrl({ ...currentState, search: v })
            }}
            className="pl-8 pr-3 py-1.5 text-sm border border-fm-outline-variant/30 rounded-xl bg-fm-surface-container-lowest text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/40 w-44"
          />
        </div>

        {/* Fase */}
        <select
          value={phaseFilter}
          onChange={(e) => {
            const v = e.target.value
            setPhaseFilter(v)
            syncUrl({ ...currentState, phase: v })
          }}
          className={SELECT_CLASS}
        >
          {PHASE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Programa */}
        <select
          value={programFilter}
          onChange={(e) => {
            const v = e.target.value
            setProgramFilter(v)
            syncUrl({ ...currentState, program: v })
          }}
          className={SELECT_CLASS}
        >
          {PROGRAM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Terapista */}
        {therapists.length > 0 && (
          <select
            value={therapistFilter}
            onChange={(e) => {
              const v = e.target.value
              setTherapistFilter(v)
              syncUrl({ ...currentState, therapist: v })
            }}
            className={SELECT_CLASS}
          >
            <option value="all">Todos los terapistas</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto text-xs text-fm-on-surface-variant">
          {filtered.length} {filtered.length === 1 ? 'niño' : 'niños'}
        </span>
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-fm-on-surface-variant">
          <span className="material-symbols-outlined text-4xl text-fm-outline-variant mb-3">
            child_care
          </span>
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">Ajustá los filtros o registrá el primer niño.</p>
        </div>
      ) : noFilters ? (
        // Vista seccionada por programa (programas primero, terapias al final).
        <div className="space-y-8">
          {PROGRAM_GROUPS.map(({ key, label }) => {
            const group = niños.filter((d) => d.child.enrolled_program === key)
            if (group.length === 0) return null
            return (
              <section key={label ?? 'terapias'} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant">
                    {label}
                  </h2>
                  <span className="text-xs text-fm-on-surface-variant/70">
                    {group.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {group.map((d) => (
                    <NinoCard key={d.child.id} data={d} phaseCatalog={phaseCatalog} returnTo={returnTo} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((d) => (
            <NinoCard key={d.child.id} data={d} phaseCatalog={phaseCatalog} returnTo={returnTo} />
          ))}
        </div>
      )}
    </div>
  )
}
