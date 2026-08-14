'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createChildSuspension,
  revertChildSuspension,
} from '@/app/actions/child-suspensions'
import { suspensionRangeLabel } from '@/lib/domain/suspensions'
import { SUSPENSION_REASON_LABELS } from '@/types/db'
import type { ChildSuspension, SuspensionReason } from '@/types/db'

const REASONS: SuspensionReason[] = ['viaje', 'salud', 'economico', 'otro']

interface Props {
  childId: string
  suspensions: ChildSuspension[]
  canManage: boolean
}

export function ChildSuspensionsSection({ childId, suspensions, canManage }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [reason, setReason] = useState<SuspensionReason>('viaje')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  const active = suspensions.filter((s) => s.status === 'active')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    startSave(async () => {
      const res = await createChildSuspension({ childId, startsOn, endsOn, reason, notes })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone(
        res.data.cancelled > 0
          ? `Suspensión registrada. Se sacaron ${res.data.cancelled} cita(s) de la agenda y no se cobran.`
          : 'Suspensión registrada. No había citas agendadas en ese período.',
      )
      setOpen(false)
      setStartsOn('')
      setEndsOn('')
      setNotes('')
      router.refresh()
    })
  }

  function handleRevert(s: ChildSuspension) {
    if (
      !window.confirm(
        `¿Revertir la suspensión ${suspensionRangeLabel(s.starts_on, s.ends_on)}? Se devuelven a la agenda las ${s.cancelled_appointments_count} cita(s) que se habían sacado, y vuelven a cobrarse.`,
      )
    ) {
      return
    }
    setError(null)
    startSave(async () => {
      const res = await revertChildSuspension(s.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone(`Suspensión revertida. Se devolvieron ${res.data.restored} cita(s) a la agenda.`)
      router.refresh()
    })
  }

  return (
    <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fm-on-surface">Suspensiones avisadas</h2>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            La familia avisa que el niño/a no vendrá un período y regresa. No se le agenda ni se le
            cobra durante esos días. No cambia su fase — no es una pausa terapéutica.
          </p>
        </div>
        {canManage && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 text-xs font-semibold text-fm-primary hover:underline"
          >
            Registrar
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {done}
        </div>
      )}

      {open && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-fm-outline-variant/20 p-3 space-y-3"
        >
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">
                No viene desde
              </span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">
                Regresa el
              </span>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              <span className="block text-[10px] text-fm-on-surface-variant mt-0.5">
                Último día que NO viene
              </span>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">
                Motivo
              </span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as SuspensionReason)}
                className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {SUSPENSION_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-fm-on-surface-variant mb-1">
              Nota (opcional)
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. viaje familiar, avisado por la mamá"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSaving ? 'Guardando…' : 'Registrar suspensión'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              className="text-sm text-fm-on-surface-variant hover:underline"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {suspensions.length === 0 ? (
        <p className="text-xs text-fm-on-surface-variant italic">Sin suspensiones registradas.</p>
      ) : (
        <ul className="divide-y divide-fm-outline-variant/10">
          {suspensions.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  s.status === 'active'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {s.status === 'active' ? 'Activa' : 'Revertida'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-fm-on-surface">
                  No viene {suspensionRangeLabel(s.starts_on, s.ends_on)}
                  <span className="text-fm-on-surface-variant">
                    {' '}
                    · {SUSPENSION_REASON_LABELS[s.reason]}
                  </span>
                </p>
                <p className="text-xs text-fm-on-surface-variant">
                  {s.cancelled_appointments_count} cita(s) fuera de la agenda
                  {s.notes ? ` · ${s.notes}` : ''}
                </p>
              </div>
              {canManage && s.status === 'active' && (
                <button
                  type="button"
                  onClick={() => handleRevert(s)}
                  disabled={isSaving}
                  className="shrink-0 text-xs font-semibold text-fm-on-surface-variant hover:text-fm-primary hover:underline disabled:opacity-50"
                >
                  Revertir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {active.length > 0 && (
        <p className="text-[11px] text-fm-on-surface-variant">
          Al generar la mensualidad, los días de una suspensión activa no se agendan ni se cobran.
        </p>
      )}
    </div>
  )
}
