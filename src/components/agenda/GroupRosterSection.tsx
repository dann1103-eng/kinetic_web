'use client'

import { useState, useTransition } from 'react'
import {
  getSessionRoster,
  markSessionAttendance,
  type RosterEntry,
  type AttendanceMark,
} from '@/app/actions/program-groups'
import type { ProgramAttendanceStatus } from '@/types/db'

export interface TodayGroupSession {
  id: string
  group_name: string
  starts_at: string
  status: string
}

interface Props {
  sessions: TodayGroupSession[]
}

const STATUS_LABEL: Record<ProgramAttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Ausente',
  excused: 'Justificado',
}

export function GroupRosterSection({ sessions }: Props) {
  if (sessions.length === 0) return null
  return (
    <section className="mb-6 rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant mb-3">
        Pasar lista — programas matutinos de hoy
      </h2>
      <div className="space-y-3">
        {sessions.map((s) => (
          <SessionRoster key={s.id} session={s} />
        ))}
      </div>
    </section>
  )
}

function SessionRoster({ session }: { session: TodayGroupSession }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [marks, setMarks] = useState<Record<string, ProgramAttendanceStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const [isLoading, startLoad] = useTransition()

  const time = new Date(session.starts_at).toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
  })

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && !loaded) {
      startLoad(async () => {
        const res = await getSessionRoster(session.id)
        if (!res.ok) {
          setError(res.error)
          return
        }
        setRoster(res.roster)
        // Precargar SOLO las marcas ya guardadas. El resto queda sin marcar:
        // como ahora se listan todos los niños del grupo (asistan hoy o no), la
        // miss marca "presente" únicamente a los que realmente llegaron.
        const initial: Record<string, ProgramAttendanceStatus> = {}
        for (const r of res.roster) if (r.status) initial[r.child_id] = r.status
        setMarks(initial)
        setLoaded(true)
      })
    }
  }

  function setMark(childId: string, status: ProgramAttendanceStatus) {
    setMarks((prev) => {
      const next = { ...prev }
      // Volver a tocar el mismo estado lo des-marca (queda sin asistencia).
      if (next[childId] === status) delete next[childId]
      else next[childId] = status
      return next
    })
    setSavedMsg(null)
  }

  function handleSave() {
    setError(null)
    setSavedMsg(null)
    // Solo se guardan los niños con una marca explícita (presente/ausente/
    // justificado). Los que no llegaron quedan sin registrar ese día.
    const entries: AttendanceMark[] = roster
      .filter((r) => marks[r.child_id])
      .map((r) => ({ childId: r.child_id, status: marks[r.child_id]! }))
    startSave(async () => {
      const res = await markSessionAttendance(session.id, entries)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSavedMsg('Lista guardada.')
    })
  }

  return (
    <div className="rounded-xl border border-fm-outline-variant/20">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-fm-surface-container-low/40"
      >
        <span className="font-semibold text-fm-on-surface">
          {session.group_name}
          <span className="ml-2 text-xs font-normal text-fm-on-surface-variant">{time}</span>
          {session.status === 'held' && (
            <span className="ml-2 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Lista pasada
            </span>
          )}
        </span>
        <span className="material-symbols-outlined text-fm-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {isLoading ? (
            <p className="text-sm text-fm-on-surface-variant">Cargando lista…</p>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-fm-on-surface-variant italic">
              Este grupo no tiene niños activos.
            </p>
          ) : (
            <>
              <p className="text-xs text-fm-on-surface-variant">
                Marcá <strong>presente</strong> a los niños que llegaron hoy. La pastilla
                <span className="mx-1 inline-flex items-center rounded-full bg-fm-surface-container px-1.5 py-0.5 text-[10px] font-bold align-middle">
                  n/N sem
                </span>
                muestra cuántas de sus visitas de la semana ya usó (sin importar el día).
              </p>
              <ul className="divide-y divide-fm-outline-variant/15">
                {roster.map((r) => {
                  const quotaMet = r.weekly_quota != null && r.weekly_used >= r.weekly_quota
                  return (
                    <li key={r.child_id} className="flex items-center justify-between gap-3 py-2">
                      {/* Sin truncate: el nombre completo (nombre + apellidos) debe verse
                          siempre; si no cabe en una línea, hace wrap. */}
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
                        <span className="text-sm text-fm-on-surface leading-snug break-words">{r.child_full_name}</span>
                        {r.weekly_quota != null && (
                          <span
                            title={`${r.weekly_used} de ${r.weekly_quota} visitas de la semana usadas`}
                            className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              quotaMet
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-fm-surface-container text-fm-on-surface-variant'
                            }`}
                          >
                            {r.weekly_used}/{r.weekly_quota} sem
                          </span>
                        )}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        {(['present', 'absent', 'excused'] as ProgramAttendanceStatus[]).map((st) => {
                          const active = marks[r.child_id] === st
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setMark(r.child_id, st)}
                              className={`text-[11px] px-2 py-1 rounded-lg border font-medium transition-colors ${
                                active
                                  ? st === 'present'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : st === 'absent'
                                      ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-white text-fm-on-surface border-fm-outline-variant/30'
                              }`}
                            >
                              {STATUS_LABEL[st]}
                            </button>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-center justify-end gap-3 pt-1">
                {savedMsg && <span className="text-xs text-emerald-700">{savedMsg}</span>}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {isSaving ? 'Guardando…' : 'Guardar lista'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
