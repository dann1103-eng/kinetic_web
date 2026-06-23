'use client'

import { useEffect, useState } from 'react'
import {
  listGroups,
  getMorningGroupContext,
  type ProgramGroupWithStaff,
  type MorningGroupContext,
} from '@/app/actions/program-groups'
import {
  computeMorningCandidates,
  type MorningCandidate,
} from '@/lib/domain/billing/morning-candidates'
import type { MorningProgram, MonthlyCandidateAppointment } from '@/types/db'
import { DraggableCycleCalendar } from './DraggableCycleCalendar'

const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'mon', label: 'Lun' },
  { code: 'tue', label: 'Mar' },
  { code: 'wed', label: 'Mié' },
  { code: 'thu', label: 'Jue' },
  { code: 'fri', label: 'Vie' },
  { code: 'sat', label: 'Sáb' },
  { code: 'sun', label: 'Dom' },
]

const PROGRAM_LABEL: Record<MorningProgram, string> = {
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
}

export interface MorningGroupSelection {
  groupId: string | null
  attendanceDays: string[]
}

/** Cita matutina a enviar al server (service + horario). */
export interface MorningCandidateOut {
  service: string
  starts_at: string
  ends_at: string
}

interface Props {
  program: MorningProgram
  /** 'YYYY-MM' del ciclo. */
  periodMonth: string
  value: MorningGroupSelection
  onChange: (next: MorningGroupSelection) => void
  /** Emite las citas matutinas finales (previsualizadas/iteradas). */
  onCandidatesChange: (candidates: MorningCandidateOut[]) => void
}

function toOut(c: MorningCandidate | MonthlyCandidateAppointment): MorningCandidateOut {
  return { service: c.service as string, starts_at: c.starts_at, ends_at: c.ends_at }
}

export function MorningProgramCycleSection({
  program,
  periodMonth,
  value,
  onChange,
  onCandidatesChange,
}: Props) {
  const [groups, setGroups] = useState<ProgramGroupWithStaff[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [context, setContext] = useState<MorningGroupContext | null>(null)
  const [candidates, setCandidates] = useState<MorningCandidate[]>([])

  // Cargar grupos del programa (loadingGroups inicia en true → sin setState síncrono).
  useEffect(() => {
    let cancel = false
    listGroups(program).then((gs) => {
      if (cancel) return
      setGroups(gs)
      setLoadingGroups(false)
    })
    return () => {
      cancel = true
    }
  }, [program])

  // Cargar contexto del grupo (horario + maestra + feriados) y recomputar citas
  // cuando cambia el grupo, el mes o los días del niño.
  useEffect(() => {
    if (!value.groupId) return
    let cancel = false
    const gid = value.groupId
    const days = value.attendanceDays
    getMorningGroupContext(gid, periodMonth).then((ctx) => {
      if (cancel) return
      setContext(ctx)
      const base = ctx
        ? computeMorningCandidates({
            group: {
              program: ctx.program,
              start_time_local: ctx.start_time_local,
              duration_minutes: ctx.duration_minutes,
              therapist_id: ctx.therapist_id,
            },
            attendanceDays: days,
            periodMonth,
            holidays: ctx.holidays,
          })
        : []
      setCandidates(base)
      onCandidatesChange(base.map(toOut))
    })
    return () => {
      cancel = true
    }
    // onCandidatesChange intencionalmente fuera de deps (estable por el padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.groupId, periodMonth, value.attendanceDays])

  function selectGroup(groupId: string) {
    const g = groups.find((x) => x.id === groupId)
    // Por default el niño asiste todos los días del grupo (ajustable).
    onChange({ groupId, attendanceDays: g ? [...g.meeting_days] : [] })
  }

  function toggleDay(code: string) {
    const has = value.attendanceDays.includes(code)
    const nextDays = has
      ? value.attendanceDays.filter((d) => d !== code)
      : [...value.attendanceDays, code]
    onChange({ groupId: value.groupId, attendanceDays: nextDays })
  }

  function handleMove(idx: number, newStartsAt: string, newEndsAt: string) {
    setCandidates((prev) => {
      const next = prev.map((c, i) =>
        i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c,
      )
      onCandidatesChange(next.map(toOut))
      return next
    })
  }
  function handleDelete(idx: number) {
    setCandidates((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      onCandidatesChange(next.map(toOut))
      return next
    })
  }

  const groupDays = context
    ? // los días del grupo vienen de su membresía/horario; usamos los del grupo elegido
      groups.find((g) => g.id === value.groupId)?.meeting_days ?? []
    : groups.find((g) => g.id === value.groupId)?.meeting_days ?? []

  return (
    <div className="rounded-lg border border-fm-primary/30 bg-fm-primary/5 p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fm-primary">
        Programa matutino — {PROGRAM_LABEL[program]} (por grupo)
      </p>

      {loadingGroups ? (
        <p className="text-xs text-fm-on-surface-variant">Cargando grupos…</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-amber-800">
          No hay grupos de {PROGRAM_LABEL[program]} creados. Creá uno en
          Administración → Grupos matutinos antes de generar el ciclo.
        </p>
      ) : (
        <>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Grupo
            </label>
            <select
              value={value.groupId ?? ''}
              onChange={(e) => selectGroup(e.target.value)}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleccioná un grupo…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.staff.length > 0 ? ` — ${g.staff.map((s) => s.full_name).join(', ')}` : ''}
                  {` · ${g.start_time_local}`}
                </option>
              ))}
            </select>
          </div>

          {value.groupId && (
            <>
              <p className="text-xs text-fm-on-surface-variant">
                Maestra(s):{' '}
                <span className="font-medium text-fm-on-surface">
                  {context?.therapist_name ?? 'sin asignar'}
                </span>
                {context && ` · ${context.start_time_local} (${context.duration_minutes} min)`}
              </p>

              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
                  Días que asiste el niño (de los del grupo)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.filter((w) => groupDays.includes(w.code)).map((w) => {
                    const active = value.attendanceDays.includes(w.code)
                    return (
                      <button
                        key={w.code}
                        type="button"
                        onClick={() => toggleDay(w.code)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-fm-primary text-white border-fm-primary'
                            : 'bg-white text-fm-on-surface border-fm-outline-variant/30'
                        }`}
                      >
                        {w.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Calendarización del mes — iterable como las terapias de la tarde */}
              <div className="rounded-lg border border-fm-outline-variant/20 bg-white p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-1.5">
                  Calendario de las {candidates.length} citas del programa
                </p>
                {candidates.length === 0 ? (
                  <p className="text-xs text-fm-on-surface-variant italic">
                    Elegí al menos un día para ver las citas del mes.
                  </p>
                ) : (
                  <DraggableCycleCalendar
                    periodMonth={`${periodMonth.slice(0, 7)}-01`}
                    candidates={candidates as unknown as MonthlyCandidateAppointment[]}
                    onMove={handleMove}
                    onRetime={handleMove}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
