'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  updateAppointment,
} from '@/app/actions/appointments'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import {
  EVENT_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  type Appointment,
  type Child,
  type EventType,
  type InstitutionalClosure,
  type Modality,
  type ServiceType,
} from '@/types/db'
import { defaultDurationMinutes, findClosureAffecting } from '@/lib/domain/appointment'

type ChildLite = Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'treatment_status'>
type TherapistLite = { id: string; full_name: string; role: string; avatar_url: string | null }

interface AppointmentFormProps {
  open: boolean
  onClose: () => void
  initialStartsAt?: string                  // ISO desde slot click
  existingAppointment?: Appointment         // modo edit
  childrenList: ChildLite[]
  therapists: TherapistLite[]
  closures: InstitutionalClosure[]
  isAdmin: boolean
  canSchedule: boolean
}

export function AppointmentForm({
  open,
  onClose,
  initialStartsAt,
  existingAppointment,
  childrenList: childrenProp,
  therapists,
  closures,
  isAdmin,
  canSchedule,
}: AppointmentFormProps) {
  const router = useRouter()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useDialogA11y({ open, onClose: () => !submitting && onClose(), ref: dialogRef })

  const isEdit = !!existingAppointment

  // Form state
  const [eventType, setEventType] = useState<EventType>(
    existingAppointment?.event_type ?? 'terapia',
  )
  const [childId, setChildId] = useState<string>(existingAppointment?.child_id ?? '')
  const [serviceType, setServiceType] = useState<ServiceType | ''>(
    existingAppointment?.service_type ?? 'lenguaje',
  )
  const [therapistId, setTherapistId] = useState<string>(
    existingAppointment?.therapist_id ?? '',
  )
  const [modality, setModality] = useState<Modality>(
    existingAppointment?.modality ?? 'presencial',
  )
  const [startsAt, setStartsAt] = useState<string>(
    toLocalInput(existingAppointment?.starts_at ?? initialStartsAt ?? new Date().toISOString()),
  )
  const [durationMin, setDurationMin] = useState<number>(
    existingAppointment
      ? Math.max(
          15,
          (new Date(existingAppointment.ends_at).getTime() - new Date(existingAppointment.starts_at).getTime()) /
            60_000,
        )
      : defaultDurationMinutes(eventType),
  )
  const [notes, setNotes] = useState<string>(existingAppointment?.notes ?? '')

  // Validación inline: cierre institucional
  const closureWarning = useMemo(() => {
    if (!startsAt) return null
    const iso = new Date(startsAt).toISOString()
    return findClosureAffecting(iso, closures)
  }, [startsAt, closures])

  function setEventTypeWithDefaults(newType: EventType) {
    setEventType(newType)
    setDurationMin(defaultDurationMinutes(newType))
    if (newType !== 'terapia') {
      // Service type irrelevante para no-terapias
      setServiceType('')
    } else if (!serviceType) {
      setServiceType('lenguaje')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const startsIso = new Date(startsAt).toISOString()
    const endsIso = new Date(new Date(startsAt).getTime() + durationMin * 60_000).toISOString()

    if (isEdit && existingAppointment) {
      const startsChanged = existingAppointment.starts_at !== startsIso
      const endsChanged = existingAppointment.ends_at !== endsIso
      if (startsChanged || endsChanged) {
        const res = await rescheduleAppointment(existingAppointment.id, startsIso, endsIso)
        if (!res.ok) {
          setError(res.error)
          setSubmitting(false)
          return
        }
      } else {
        const res = await updateAppointment(existingAppointment.id, {
          event_type: eventType,
          service_type: eventType === 'terapia' ? (serviceType as ServiceType) : null,
          therapist_id: eventType === 'terapia' ? therapistId : (therapistId || null),
          modality,
          notes: notes || null,
        })
        if (!res.ok) {
          setError(res.error)
          setSubmitting(false)
          return
        }
      }
    } else {
      const res = await createAppointment({
        child_id: childId,
        therapist_id: eventType === 'terapia' ? therapistId : therapistId || null,
        event_type: eventType,
        service_type: eventType === 'terapia' ? (serviceType as ServiceType) : null,
        modality,
        starts_at: startsIso,
        ends_at: endsIso,
        notes: notes || null,
        force: !!closureWarning && isAdmin,
      })
      if (!res.ok) {
        setError(res.error)
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    onClose()
    router.refresh()
  }

  async function handleCancel() {
    if (!existingAppointment) return
    if (!window.confirm('¿Confirmás cancelación de esta cita?')) return
    setSubmitting(true)
    const res = await cancelAppointment(existingAppointment.id, 'late_cancel')
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
    router.refresh()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-fm-surface-container-lowest text-fm-on-surface w-full max-w-2xl rounded-2xl shadow-xl border border-fm-outline-variant/30 max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-fm-outline-variant/20 flex items-center justify-between sticky top-0 bg-fm-surface-container-lowest z-10">
            <h2 id={titleId} className="text-base font-semibold">
              {isEdit ? 'Editar cita' : 'Nueva cita'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Cerrar"
              className="text-fm-on-surface-variant hover:text-fm-on-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* 1. Tipo de evento */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Tipo de evento
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de evento">
                {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={eventType === code}
                    onClick={() => setEventTypeWithDefaults(code)}
                    disabled={isEdit}
                    className={`text-xs min-h-[36px] px-3 py-1 rounded-full border transition-colors ${
                      eventType === code
                        ? 'bg-fm-primary/10 border-fm-primary text-fm-primary'
                        : 'bg-fm-surface-container-low border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'
                    } ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isEdit && (
                <p className="text-[10px] text-fm-on-surface-variant">El tipo no se puede cambiar al editar.</p>
              )}
            </fieldset>

            {/* 2. Niño */}
            <fieldset className="space-y-1">
              <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Niño/a
              </legend>
              <select
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                disabled={isEdit}
                required
                className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary disabled:opacity-60"
              >
                <option value="">— Selecciona —</option>
                {childrenProp.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} {c.code ? `(${c.code})` : ''}
                  </option>
                ))}
              </select>
            </fieldset>

            {/* 3. Servicio + terapista (si aplica) */}
            {eventType === 'terapia' && (
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                  Terapia
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Tipo de servicio</label>
                    <select
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value as ServiceType)}
                      required
                      className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                    >
                      {(Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][]).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Terapista</label>
                    <select
                      value={therapistId}
                      onChange={(e) => setTherapistId(e.target.value)}
                      required
                      className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                    >
                      <option value="">— Selecciona —</option>
                      {therapists.map((t) => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            )}

            {/* 4. Modalidad */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Modalidad
              </legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Modalidad">
                {(['presencial', 'virtual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modality === m}
                    onClick={() => setModality(m)}
                    className={`flex-1 min-h-[40px] text-xs px-3 py-2 rounded-xl border transition-colors capitalize ${
                      modality === m
                        ? 'bg-fm-primary/10 border-fm-primary text-fm-primary'
                        : 'bg-fm-surface-container-low border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {modality === 'virtual' && (
                <p className="text-[10px] text-fm-on-surface-variant/80">
                  El link de Google Meet se generará automáticamente cuando se active la integración (próxima sesión).
                </p>
              )}
            </fieldset>

            {/* 5. Fecha + duración */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Fecha y hora
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Inicio</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Duración (min)</label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(parseInt(e.target.value, 10) || 30)}
                    className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                  />
                </div>
              </div>
              {closureWarning && (
                <div className="rounded-xl bg-fm-error/5 border border-fm-error/30 p-3">
                  <p className="text-xs font-medium text-fm-error">
                    Centro cerrado ese día: {closureWarning.name}
                  </p>
                  {!isAdmin && (
                    <p className="text-[10px] text-fm-error/80 mt-1">
                      Solo admin puede agendar excepciones en días de cierre.
                    </p>
                  )}
                  {isAdmin && (
                    <p className="text-[10px] text-fm-error/80 mt-1">
                      Como admin podés guardar de todos modos (queda registrado como excepción).
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {/* 6. Notas */}
            <fieldset>
              <label className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant block mb-1">
                Notas
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
              />
            </fieldset>

            {error && (
              <p role="alert" className="text-xs text-fm-error">
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-fm-outline-variant/20 flex items-center justify-between gap-2 sticky bottom-0 bg-fm-surface-container-lowest z-10">
            <div>
              {isEdit && canSchedule && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="min-h-[44px] px-4 py-2 text-sm rounded-xl text-fm-error hover:bg-fm-error/10"
                >
                  Cancelar cita
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="min-h-[44px] px-4 py-2 text-sm rounded-xl text-fm-on-surface-variant hover:bg-fm-surface-container"
              >
                Cerrar
              </button>
              {canSchedule && (
                <button
                  type="submit"
                  disabled={submitting || (!!closureWarning && !isAdmin)}
                  className="min-h-[44px] px-4 py-2 text-sm rounded-xl bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim disabled:opacity-50"
                >
                  {submitting ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear cita'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Convierte ISO a el formato local de <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
