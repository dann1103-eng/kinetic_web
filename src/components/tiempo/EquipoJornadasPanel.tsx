'use client'

import { useEffect, useState } from 'react'
import {
  listUserWorkSessions,
  adminDeleteWorkSession,
  type JornadaGranularity,
} from '@/app/actions/work-sessions-admin'
import type { WorkSession } from '@/types/db'
import { EditWorkSessionModal } from './EditWorkSessionModal'

const TZ = 'America/El_Salvador'

interface StaffLite {
  id: string
  full_name: string
  role: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function todaySv(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function shiftAnchor(anchor: string, granularity: JornadaGranularity, dir: 1 | -1): string {
  const [y, m, d] = anchor.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (granularity === 'dia') date.setUTCDate(date.getUTCDate() + dir)
  else date.setUTCMonth(date.getUTCMonth() + dir)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function rangeLabel(granularity: JornadaGranularity, anchor: string): string {
  const [y, m, d] = anchor.split('-').map(Number)
  if (granularity === 'dia') {
    return new Intl.DateTimeFormat('es-SV', {
      timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    }).format(new Date(Date.UTC(y, m - 1, d, 12)))
  }
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: TZ, month: 'long', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 1, 12)))
}

function fmtDuration(totalSeconds: number | null): string {
  const s = Math.max(0, totalSeconds ?? 0)
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(iso))
}

export function EquipoJornadasPanel({ staff }: { staff: StaffLite[] }) {
  const [userId, setUserId] = useState(staff[0]?.id ?? '')
  const [granularity, setGranularity] = useState<JornadaGranularity>('dia')
  const [anchor, setAnchor] = useState(todaySv())
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [modal, setModal] = useState<{ open: boolean; session: WorkSession | null }>({ open: false, session: null })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listUserWorkSessions(userId, granularity, anchor).then((res) => {
      if (cancelled) return
      if (res.ok) { setSessions(res.sessions); setError(null) }
      else { setSessions([]); setError(res.error) }
    })
    return () => { cancelled = true }
  }, [userId, granularity, anchor, reloadTick])

  const reload = () => setReloadTick((t) => t + 1)

  async function handleDelete(id: string) {
    if (!window.confirm('¿Borrar esta jornada?')) return
    const res = await adminDeleteWorkSession(id)
    if (!res.ok) { setError(res.error); return }
    reload()
  }

  const totalSeconds = sessions.reduce((s, x) => s + (x.total_seconds ?? 0), 0)
  const selectedName = staff.find((s) => s.id === userId)?.full_name ?? '—'

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="text-sm px-3 py-2 bg-fm-surface-container-lowest border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} ({s.role.replace('_', ' ')})
            </option>
          ))}
        </select>

        <div className="inline-flex rounded-full border border-fm-outline-variant/40 p-0.5 bg-fm-surface-container-low">
          {(['dia', 'mes'] as JornadaGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`px-3.5 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                g === granularity ? 'bg-fm-primary text-white' : 'text-fm-on-surface-variant hover:text-fm-on-surface'
              }`}
            >
              {g === 'dia' ? 'Día' : 'Mes'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => setAnchor((a) => shiftAnchor(a, granularity, -1))}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-fm-on-surface capitalize min-w-[14ch] text-center">
            {rangeLabel(granularity, anchor)}
          </span>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => setAnchor((a) => shiftAnchor(a, granularity, 1))}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
          <button
            type="button"
            onClick={() => setAnchor(todaySv())}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface"
          >
            Hoy
          </button>
        </div>

        <button
          type="button"
          onClick={() => setModal({ open: true, session: null })}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Agregar entrada
        </button>
      </div>

      {/* Total */}
      <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-low/40 px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-fm-on-surface-variant">
          Total de jornada de <span className="font-semibold text-fm-on-surface">{selectedName}</span> en el período
        </p>
        <p className="text-lg font-bold tabular-nums text-fm-primary">{fmtDuration(totalSeconds)}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-fm-error/30 bg-fm-error/10 px-4 py-2.5 text-sm text-fm-error">{error}</div>
      )}

      {/* Lista */}
      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-fm-outline-variant/30 px-4 py-8 text-center text-sm text-fm-on-surface-variant">
          Sin jornadas registradas en este período.
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const active = !s.ended_at
            return (
              <li
                key={s.id}
                className="rounded-xl border border-fm-outline-variant/30 px-4 py-3 flex items-center gap-3"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-fm-primary animate-pulse' : 'bg-fm-on-surface-variant/40'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fm-on-surface capitalize">
                    {fmtDay(s.started_at)} · {fmtTime(s.started_at)} – {s.ended_at ? fmtTime(s.ended_at) : 'activa'}
                  </p>
                  {s.notes && <p className="text-[11px] text-fm-on-surface-variant truncate">{s.notes}</p>}
                </div>
                <span className="text-sm tabular-nums text-fm-on-surface-variant shrink-0">{fmtDuration(s.total_seconds)}</span>
                <button
                  type="button"
                  onClick={() => setModal({ open: true, session: s })}
                  className="text-fm-on-surface-variant hover:text-fm-primary p-1"
                  aria-label="Editar"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="text-fm-on-surface-variant hover:text-fm-error p-1"
                  aria-label="Borrar"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {modal.open && (
        <EditWorkSessionModal
          userId={userId}
          userName={selectedName}
          session={modal.session}
          defaultDate={granularity === 'dia' ? anchor : todaySv()}
          onClose={() => setModal({ open: false, session: null })}
          onSaved={() => { setModal({ open: false, session: null }); reload() }}
        />
      )}
    </div>
  )
}
