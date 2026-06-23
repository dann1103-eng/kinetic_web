'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  listGroups,
  getGroupMonthCalendar,
  generateGroupSessionsForMonth,
  type ProgramGroupWithStaff,
} from '@/app/actions/program-groups'
import type { MorningProgram, ProgramGroup, ProgramGroupSession } from '@/types/db'

const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'mon', label: 'Lun' },
  { code: 'tue', label: 'Mar' },
  { code: 'wed', label: 'Mié' },
  { code: 'thu', label: 'Jue' },
  { code: 'fri', label: 'Vie' },
  { code: 'sat', label: 'Sáb' },
  { code: 'sun', label: 'Dom' },
]

const DOW_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dowOf(dateStr: string): string {
  return DOW_CODES[new Date(`${dateStr}T12:00:00`).getDay()]
}

export interface MorningGroupSelection {
  groupId: string | null
  attendanceDays: string[]
}

interface Props {
  program: MorningProgram
  /** 'YYYY-MM' del ciclo. */
  periodMonth: string
  value: MorningGroupSelection
  onChange: (next: MorningGroupSelection) => void
}

const PROGRAM_LABEL: Record<MorningProgram, string> = {
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
}

export function MorningProgramCycleSection({ program, periodMonth, value, onChange }: Props) {
  const [groups, setGroups] = useState<ProgramGroupWithStaff[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)

  const [group, setGroup] = useState<ProgramGroup | null>(null)
  const [staffNames, setStaffNames] = useState<string[]>([])
  const [sessions, setSessions] = useState<ProgramGroupSession[]>([])

  const [isGenerating, startGenerate] = useTransition()
  const [isLoadingCal, startLoadCal] = useTransition()
  const [genMsg, setGenMsg] = useState<string | null>(null)

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

  // Cargar calendario del grupo seleccionado para el mes.
  useEffect(() => {
    if (!value.groupId) return
    let cancel = false
    const gid = value.groupId
    startLoadCal(async () => {
      const res = await getGroupMonthCalendar(gid, periodMonth)
      if (cancel) return
      setGroup(res.group)
      setStaffNames(res.staffNames)
      setSessions(res.sessions)
    })
    return () => {
      cancel = true
    }
  }, [value.groupId, periodMonth, genMsg])

  function selectGroup(groupId: string) {
    const g = groups.find((x) => x.id === groupId)
    // Por default, el niño asiste todos los días del grupo (ajustable).
    onChange({ groupId, attendanceDays: g ? [...g.meeting_days] : [] })
  }

  function toggleDay(code: string) {
    const has = value.attendanceDays.includes(code)
    onChange({
      groupId: value.groupId,
      attendanceDays: has
        ? value.attendanceDays.filter((d) => d !== code)
        : [...value.attendanceDays, code],
    })
  }

  function handleGenerate() {
    if (!value.groupId) return
    setGenMsg(null)
    startGenerate(async () => {
      const res = await generateGroupSessionsForMonth(value.groupId!, periodMonth)
      setGenMsg(res.ok ? `Se generaron ${res.created} sesión(es).` : res.error)
    })
  }

  const groupDays = group?.meeting_days ?? []

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
          Administración → Grupos antes de generar el ciclo.
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
              {/* Maestra(s) asignada(s) */}
              <p className="text-xs text-fm-on-surface-variant">
                Maestra(s):{' '}
                <span className="font-medium text-fm-on-surface">
                  {staffNames.length > 0 ? staffNames.join(', ') : 'sin asignar'}
                </span>
                {group && ` · ${group.start_time_local} (${group.duration_minutes} min)`}
              </p>

              {/* Días del niño */}
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

              {/* Calendarización del mes */}
              <div className="rounded-lg border border-fm-outline-variant/20 bg-white p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                    Calendarización del mes
                  </span>
                  {sessions.length === 0 && (
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="text-[11px] text-fm-primary hover:underline disabled:opacity-50"
                    >
                      {isGenerating ? 'Generando…' : 'Generar sesiones del mes'}
                    </button>
                  )}
                </div>
                {isLoadingCal ? (
                  <p className="text-xs text-fm-on-surface-variant">Cargando…</p>
                ) : sessions.length === 0 ? (
                  <p className="text-xs text-fm-on-surface-variant italic">
                    Aún no hay sesiones generadas para este mes. Generálas para ver el
                    calendario.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {sessions.map((s) => {
                      const attends = value.attendanceDays.includes(dowOf(s.session_date))
                      const d = new Date(`${s.session_date}T12:00:00`)
                      return (
                        <span
                          key={s.id}
                          className={`text-[11px] px-1.5 py-0.5 rounded tabular-nums ${
                            attends
                              ? 'bg-fm-primary/15 text-fm-primary font-semibold'
                              : 'bg-fm-surface-container text-fm-on-surface-variant/60 line-through'
                          }`}
                          title={attends ? 'El niño asiste' : 'El niño no asiste este día'}
                        >
                          {d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })}
                        </span>
                      )
                    })}
                  </div>
                )}
                {genMsg && <p className="mt-1.5 text-[11px] text-fm-on-surface-variant">{genMsg}</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
