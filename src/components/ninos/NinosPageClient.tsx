'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NinoCard } from './NinoCard'
import type { NinoCardData } from '@/lib/domain/ninos-dashboard'
import type { IntakePhaseCatalogEntry, MorningProgram } from '@/types/db'

interface Props {
  niños: NinoCardData[]
  periodMonth: string       // 'YYYY-MM' activo
  availableMonths: string[]
  phaseCatalog: IntakePhaseCatalogEntry[]
}

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

export function NinosPageClient({ niños, periodMonth, availableMonths, phaseCatalog }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<string>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')

  const filtered = niños.filter((d) => {
    if (search && !d.child.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (!phaseMatchesFilter(d.child.current_phase_code, phaseFilter)) return false
    if (programFilter !== 'all') {
      if (programFilter === 'none' && d.child.enrolled_program !== null) return false
      if (programFilter !== 'none' && d.child.enrolled_program !== (programFilter as MorningProgram)) {
        return false
      }
    }
    return true
  })

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Selector de mes (URL-driven → server refetch) */}
        <select
          value={periodMonth}
          onChange={(e) => router.push(`/ninos?month=${e.target.value}`)}
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
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-fm-outline-variant/30 rounded-xl bg-fm-surface-container-lowest text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/40 w-44"
          />
        </div>

        {/* Fase */}
        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
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
          onChange={(e) => setProgramFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          {PROGRAM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((d) => (
            <NinoCard key={d.child.id} data={d} phaseCatalog={phaseCatalog} />
          ))}
        </div>
      )}
    </div>
  )
}
