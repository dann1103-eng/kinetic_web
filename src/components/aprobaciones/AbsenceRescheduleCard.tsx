'use client'

import { useState, useTransition } from 'react'
import {
  resolveAbsenceWithReplacement,
  waiveAbsence,
  getReplacementSuggestions,
  type AbsenceRow,
  type ReplacementSuggestion,
} from '@/app/actions/absences'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import { TherapistAvailabilityCalendar } from './TherapistAvailabilityCalendar'
import {
  daysSinceReported,
  isAbsenceExpired,
  isAbsenceNearExpiry,
  REPLACEMENT_WINDOW_DAYS,
} from '@/lib/domain/absence'

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

/** ISO UTC → 'YYYY-MM-DDTHH:MM' en TZ local del browser. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AbsenceRescheduleCard({ row, therapists, onResolved }: Props) {
  const expired = isAbsenceExpired(row.absence.reported_at)
  const nearExpiry = !expired && isAbsenceNearExpiry(row.absence.reported_at)
  const daysOld = daysSinceReported(row.absence.reported_at)

  const [mode, setMode] = useState<'idle' | 'reschedule' | 'waive'>(
    expired ? 'waive' : 'idle',
  )
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

  // Suggestions state
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[] | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Waive state
  const [waiveReason, setWaiveReason] = useState('')

  const childName = row.child?.preferred_name ?? row.child?.full_name ?? 'Niño/a'
  const therapistName = row.therapist?.full_name ?? '—'
  const serviceType = row.originalAppointment?.service_type ?? null
  const serviceLabel = serviceType
    ? SERVICE_TYPE_LABELS[serviceType as ServiceType] ?? serviceType
    : '—'

  function handleLoadSuggestions() {
    setError(null)
    setLoadingSuggestions(true)
    startTransition(async () => {
      const res = await getReplacementSuggestions(row.absence.id)
      setLoadingSuggestions(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuggestions(res.suggestions)
      if (res.therapistId && !therapistId) {
        setTherapistId(res.therapistId)
      }
    })
  }

  function applySuggestion(s: ReplacementSuggestion) {
    setStartsLocal(isoToLocalInput(s.starts_at))
    setDurationMin(s.durationMinutes)
  }

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
        {expired && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
            <span className="material-symbols-outlined text-sm">timer_off</span>
            Vencida ({daysOld} días)
          </span>
        )}
        {nearExpiry && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            <span className="material-symbols-outlined text-sm">timer</span>
            Vence pronto ({REPLACEMENT_WINDOW_DAYS - daysOld}d)
          </span>
        )}
      </div>

      {/* Aviso de vencida */}
      {expired && mode === 'waive' && (
        <p className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          La ventana de {REPLACEMENT_WINDOW_DAYS} días para reponer ya venció.
          Solo podés cerrar esta solicitud como &ldquo;no reponer&rdquo;.
        </p>
      )}

      {/* Actions */}
      {mode === 'idle' && !expired && (
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
          {/* 1) Terapista + Duración */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Field label="Terapista">
                <select
                  value={therapistId}
                  onChange={(e) => setTherapistId(e.target.value)}
                  className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-2 py-1.5 text-sm"
                >
                  <option value="">— Elegir —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Duración (min)">
              <input
                type="number"
                min={5}
                max={240}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
          </div>

          {/* 2) Sugerencias como atajo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Sugerencias automáticas (próximos 14 días)
              </span>
              <button
                type="button"
                onClick={handleLoadSuggestions}
                disabled={loadingSuggestions || isPending}
                className="text-xs font-medium text-fm-primary hover:underline disabled:opacity-60"
              >
                {loadingSuggestions ? 'Buscando…' : suggestions ? 'Refrescar' : 'Sugerir horarios'}
              </button>
            </div>
            {suggestions && suggestions.length === 0 && (
              <p className="text-xs text-amber-900 bg-amber-100/60 rounded-md px-2 py-1.5">
                No se encontraron slots libres en los próximos 14 días.
              </p>
            )}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => {
                  const selected = startsLocal === isoToLocalInput(s.starts_at)
                  return (
                    <button
                      key={s.starts_at}
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className={`rounded-md border px-2 py-1 text-xs transition ${
                        selected
                          ? 'border-fm-primary bg-fm-primary text-white'
                          : 'border-fm-outline-variant/40 bg-fm-background text-fm-on-surface hover:bg-fm-primary/10'
                      }`}
                    >
                      {formatDateTime(s.starts_at)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3) Calendario del terapista */}
          {therapistId ? (
            <TherapistAvailabilityCalendar
              therapistId={therapistId}
              durationMinutes={durationMin}
              onSlotClick={(start) => setStartsLocal(isoToLocalInput(start))}
              highlightSuggestions={suggestions ?? undefined}
              selectedStartIso={startsLocal ? localInputToISO(startsLocal) : null}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 p-6 text-center">
              <p className="text-xs text-fm-on-surface-variant">
                Elegí un terapista para ver su agenda.
              </p>
            </div>
          )}

          {/* 4) Fecha/hora + Modalidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Nueva fecha y hora">
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Modalidad">
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as 'presencial' | 'virtual')}
                className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-2 py-1.5 text-sm"
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
            className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-3 py-2 text-sm"
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
            className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            {!expired && (
              <button
                type="button"
                onClick={() => setMode('idle')}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
            )}
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
