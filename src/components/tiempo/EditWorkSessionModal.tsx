'use client'

import { useState } from 'react'
import { fromZonedTime } from 'date-fns-tz'
import { adminUpsertWorkSession } from '@/app/actions/work-sessions-admin'
import type { WorkSession } from '@/types/db'

const TZ = 'America/El_Salvador'

function svParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { date, time }
}

interface Props {
  userId: string
  userName: string
  /** Sesión a editar, o null para alta nueva. */
  session: WorkSession | null
  /** Fecha por defecto (YYYY-MM-DD SV) para una entrada nueva. */
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}

export function EditWorkSessionModal({ userId, userName, session, defaultDate, onClose, onSaved }: Props) {
  const initialStart = session ? svParts(session.started_at) : { date: defaultDate, time: '08:00' }
  const [date, setDate] = useState(initialStart.date)
  const [start, setStart] = useState(initialStart.time)
  const [end, setEnd] = useState(session?.ended_at ? svParts(session.ended_at).time : '12:00')
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    const startISO = fromZonedTime(`${date}T${start}:00`, TZ).toISOString()
    const endISO = fromZonedTime(`${date}T${end}:00`, TZ).toISOString()
    setPending(true)
    const res = await adminUpsertWorkSession({
      id: session?.id,
      userId,
      startedAtISO: startISO,
      endedAtISO: endISO,
      notes: notes.trim() || null,
    })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <p className="text-[10px] font-bold uppercase tracking-wider text-fm-primary">
            {session ? 'Editar jornada' : 'Agregar jornada'}
          </p>
          <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">{userName}</h3>
        </header>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Fecha</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Entrada</span>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-md border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Salida</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Nota (opcional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: corrección — olvidó marcar salida"
              className="rounded-md border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-fm-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
