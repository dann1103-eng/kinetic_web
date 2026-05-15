'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NinoCard } from './NinoCard'
import type { NinoCardData } from '@/lib/domain/ninos-dashboard'
import type { TreatmentStatus, MorningProgram } from '@/types/db'

interface Props {
  niños: NinoCardData[]
  periodMonth: string       // 'YYYY-MM' activo
  availableMonths: string[]
}

function monthLabel(ym: string): string {
  return new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activo' },
  { value: 'paused', label: 'Pausado' },
  { value: 'considering_discharge', label: 'Por dar alta' },
  { value: 'discharged_conditional', label: 'Alta condicional' },
  { value: 'discharged_final', label: 'Alta final' },
  { value: 'dropped', label: 'Baja' },
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

export function NinosPageClient({ niños, periodMonth, availableMonths }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')

  const filtered = niños.filter((d) => {
    if (search && !d.child.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && d.child.treatment_status !== (statusFilter as TreatmentStatus)) {
      return false
    }
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

        {/* Estado */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          {STATUS_OPTIONS.map((o) => (
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
            <NinoCard key={d.child.id} data={d} />
          ))}
        </div>
      )}
    </div>
  )
}
