'use client'

import { useState, useTransition } from 'react'
import {
  resolveAbsenceWithReplacement,
  waiveAbsence,
  type AbsenceRow,
} from '@/app/actions/absences'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'

interface TherapistOption {
  id: string
  full_name: string
  role: string
}

interface Props {
  row: AbsenceRow
  therapists: TherapistOption[]
  onResolved: (absenceId: string) => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** ISO local 'YYYY-MM-DDTHH:MM' → Date timestamp respetando TZ del browser. */
function localInputToISO(local: string): string {
  // datetime-local viene sin TZ; lo interpretamos en hora local del browser.
  return new Date(local).toISOString()
}

export function AbsenceRescheduleCard({ row, therapists, onResolved }: Props) {
  const [mode, setMode] = useState<'idle' | 'reschedule' | 'waive'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reschedule form state
  const [startsLocal, setStartsLocal] = useState('')
  const [durationMin, setDurationMin] = useState(45)
  const [therapistId, setTherapistId] = useState(row.absence.therapist_id ?? '')
  const [modality, setModality] = useState<'presencial' | 'virtual'>(
    row.originalAppointment?.modality ?? 'presencial',
  )
  const [notes, setNotes] = useState('')

  // Waive state
  const [waiveReason, setWaiveReason] = useState('')

  const childName = row.child?.preferred_name ?? row.child?.full_name ?? 'Niño/a'
  const therapistName = row.therapist?.full_name ?? '—'
  const serviceType = row.originalAppointment?.service_type ?? null
  const serviceLabel = serviceType
    ? SERVICE_TYPE_LABELS[serviceType as ServiceType] ?? serviceType
    : '—'

  function handleConfirmReschedule() {
    setError(null)
    if (!startsLocal) {
      setError('Elegí fecha y hora de la nueva sesión.')
      return
    }
    if (!therapistId) {
      setError('Elegí un terapista.')
      return
    }
    const startsISO = localInputToISO(startsLocal)
    const endsISO = new Date(
      new Date(startsISO).getTime() + durationMin * 60 * 1000,
    ).toISOString()

    startTransition(async () => {
      const res = await resolveAbsenceWithReplacement({
        absenceId: row.absence.id,
        startsAt: startsISO,
        endsAt: endsISO,
        therapistId,
        modality,
        notes: notes.trim() || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onResolved(row.absence.id)
    })
  }

  function handleConfirmWaive() {
    setError(null)
    if (waiveReason.trim().length < 5) {
      setError('El motivo debe tener al menos 5 caracteres.')
      return
    }
    startTransition(async () => {
      const res = await waiveAbsence(row.absence.id, waiveReason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onResolved(row.absence.id)
    })
  }

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Inasistencia · {row.originalAppointment?.starts_at ? formatDateTime(row.originalAppointment.starts_at) : 'fecha desconocida'}
          </p>
          <h3 className="text-base font-semibold text-amber-900 mt-0.5">
            {childName} · {serviceLabel}
          </h3>
          <p className="text-xs text-amber-800/80">
            Terapista original: {therapistName}
          </p>
          {row.absence.reason && (
            <p className="text-xs text-amber-900 mt-1 italic">
              Motivo: &ldquo;{row.absence.reason}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {mode === 'idle' && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setMode('reschedule')}
            className="flex-1 py-2 rounded-xl bg-fm-primary text-white text-sm font-semibold hover:opacity-90"
          >
            Reagendar
          </button>
          <button
            type="button"
            onClick={() => setMode('waive')}
            className="flex-1 py-2 rounded-xl border border-fm-outline-variant/40 text-fm-on-surface text-sm font-medium hover:bg-fm-surface-container"
          >
            No reponer
          </button>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="space-y-3 pt-2 border-t border-amber-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Nueva fecha y hora">
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Duración (min)">
              <input
                type="number"
                min={5}
                max={240}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
            <Field label="Terapista">
              <select
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— Elegir —</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modalidad">
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as 'presencial' | 'virtual')}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
              >
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </Field>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas opcionales para el terapista…"
            className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('idle')}
              disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmReschedule}
              disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? 'Creando…' : 'Crear reposición'}
            </button>
          </div>
        </div>
      )}

      {mode === 'waive' && (
        <div className="space-y-3 pt-2 border-t border-amber-200">
          <textarea
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            rows={3}
            placeholder="Motivo (mín. 5 caracteres). Ej: cancelación con causa válida, niño dado de alta, etc."
            className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('idle')}
              disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmWaive}
              disabled={isPending}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-700 text-white font-medium hover:bg-zinc-800 disabled:opacity-60"
            >
              {isPending ? 'Guardando…' : 'Confirmar no reponer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
