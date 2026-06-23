'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startTherapySession, finishTherapySession } from '@/app/actions/therapy-sessions'
import { markAbsence } from '@/app/actions/absences'
import { dispatchChild, handToReception } from '@/app/actions/dispatch'
import { ReportButton } from '@/components/agenda/SessionCard'
import { formatElapsed, formatDuration, getInitials } from '@/lib/domain/sessions'
import type { Appointment, TherapySession, SessionReport } from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

interface BigSessionCardProps {
  appointment: AppointmentWithChild
  session: TherapySession | null
  report?: SessionReport | null
  variant: 'primary' | 'secondary'
  onNoteClick?: (appointmentId: string) => void
  onReportClick?: (sessionId: string) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function plannedDurationMin(starts: string, ends: string | null): number | null {
  if (!ends) return null
  return Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 60000)
}

export function BigSessionCard({
  appointment,
  session,
  report,
  variant,
  onNoteClick,
  onReportClick,
}: BigSessionCardProps) {
  const router = useRouter()
  const [, setTick] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [absenceReason, setAbsenceReason] = useState('')
  const [absenceError, setAbsenceError] = useState<string | null>(null)
  const [absencePending, startAbsenceTransition] = useTransition()

  useEffect(() => {
    if (appointment.status !== 'in_progress' || !session) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [appointment.status, session])

  const elapsed = session?.started_at
    ? Math.floor((new Date().getTime() - new Date(session.started_at).getTime()) / 1000)
    : 0

  const childName = appointment.child_preferred_name ?? appointment.child_full_name ?? 'Paciente'
  const initials = getInitials(childName)
  const startLabel = formatTime(appointment.starts_at)
  const endLabel = appointment.ends_at ? formatTime(appointment.ends_at) : null
  const durationMin = plannedDurationMin(appointment.starts_at, appointment.ends_at)

  const handleStart = () => {
    startTransition(async () => {
      const result = await startTherapySession(appointment.id)
      if (!result.ok) alert(result.error)
    })
  }

  const handleFinish = () => {
    if (!session) return
    startTransition(async () => {
      const result = await finishTherapySession(session.id)
      if (!result.ok) alert(result.error)
    })
  }

  const handleConfirmAbsence = () => {
    setAbsenceError(null)
    startAbsenceTransition(async () => {
      const res = await markAbsence(appointment.id, absenceReason.trim() || undefined)
      if (!res.ok) {
        setAbsenceError(res.error)
        return
      }
      setShowAbsenceModal(false)
      setAbsenceReason('')
      router.refresh()
    })
  }

  const isPrimary = variant === 'primary'
  // Cards de mi-día — paleta Kinetic teal en lugar del fm-secondary-container
  // (que se rendía como naranja-marrón en dark mode).
  const cardClass = isPrimary
    ? 'bg-fm-primary/10 dark:bg-fm-primary/15 text-fm-on-surface ring-1 ring-fm-primary/30'
    : 'bg-fm-surface-container text-fm-on-surface ring-1 ring-fm-outline-variant/30'
  const subtleClass = 'text-fm-on-surface-variant'
  const pillClass = isPrimary
    ? 'bg-fm-primary/15 text-fm-primary'
    : 'bg-fm-on-surface/5 text-fm-on-surface-variant'
  const avatarClass = isPrimary
    ? 'bg-fm-primary/20 text-fm-primary'
    : 'bg-fm-on-surface/10 text-fm-on-surface'

  const reposTag =
    appointment.status === 'replacement' ? { label: 'Reposición', cls: 'bg-fm-tertiary text-white' }
    : appointment.status === 'rescheduled' ? { label: 'Reagendada', cls: 'bg-fm-on-surface-variant/70 text-white' }
    : null

  return (
    <div className={`relative overflow-hidden rounded-[40px] p-8 ${cardClass}`}>
      {reposTag && (
        <span className={`absolute top-4 right-4 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${reposTag.cls}`}>
          {reposTag.label}
        </span>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl sm:text-[28px] font-bold leading-tight max-w-[260px] truncate">
            {childName}
          </h3>
          {appointment.service_type && (
            <p className={`mt-2 text-sm font-medium capitalize ${subtleClass}`}>
              {appointment.service_type.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        <div
          className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ${avatarClass}`}
          aria-hidden="true"
        >
          {initials || '·'}
        </div>
      </div>

      {(appointment.status === 'no_show' || appointment.status === 'late_cancel') ? (
        <div className="mt-8 flex items-center gap-2 text-sm font-medium">
          <span className={`px-3 py-1.5 rounded-full bg-fm-error/15 text-fm-error`}>
            {appointment.status === 'no_show' ? 'No se presentó' : 'Cancelación tardía'}
          </span>
          {appointment.status === 'no_show' && (
            <span className={`text-xs italic ${subtleClass}`}>
              Esperando reagendamiento
            </span>
          )}
        </div>
      ) : (
        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <div className="text-xl font-semibold tabular-nums">{startLabel}</div>
            <div className={`text-[11px] uppercase tracking-wider font-bold mt-1 ${subtleClass}`}>
              Inicio
            </div>
          </div>
          {durationMin && (
            <div className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide ${pillClass}`}>
              {durationMin} min
            </div>
          )}
          {endLabel && (
            <div className="text-right">
              <div className="text-xl font-semibold tabular-nums">{endLabel}</div>
              <div className={`text-[11px] uppercase tracking-wider font-bold mt-1 ${subtleClass}`}>
                Fin
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {appointment.status === 'scheduled' && (
          <>
            <button
              onClick={handleStart}
              disabled={isPending || absencePending}
              className="flex-1 min-w-[140px] py-2.5 rounded-2xl bg-fm-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-fm-primary/90 transition-colors"
            >
              {isPending ? 'Iniciando…' : 'Iniciar sesión'}
            </button>
            <button
              onClick={() => setShowAbsenceModal(true)}
              disabled={isPending || absencePending}
              className="px-4 py-2.5 rounded-2xl bg-amber-500/20 dark:bg-amber-500/25 text-amber-900 dark:text-amber-100 text-xs font-semibold disabled:opacity-50 hover:bg-amber-500/30 dark:hover:bg-amber-500/35 transition-colors"
            >
              Inasistencia
            </button>
          </>
        )}

        {appointment.status === 'in_progress' && session && (
          <>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {formatElapsed(elapsed)}
            </div>
            <button
              onClick={handleFinish}
              disabled={isPending || absencePending}
              className="flex-1 min-w-[140px] py-2.5 rounded-2xl bg-fm-error text-white text-sm font-semibold disabled:opacity-50 hover:bg-fm-error/90 transition-colors"
            >
              {isPending ? 'Finalizando…' : 'Finalizar'}
            </button>
            <button
              onClick={() => setShowAbsenceModal(true)}
              disabled={isPending || absencePending}
              className="px-4 py-2.5 rounded-2xl bg-amber-500/20 dark:bg-amber-500/25 text-amber-900 dark:text-amber-100 text-xs font-semibold disabled:opacity-50 hover:bg-amber-500/30 dark:hover:bg-amber-500/35 transition-colors"
            >
              Inasistencia
            </button>
          </>
        )}

        {appointment.status === 'completed' && session?.ended_at && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span
                className="material-symbols-outlined text-green-600"
                style={{ fontSize: '20px' }}
              >
                check_circle
              </span>
              {formatDuration(session.started_at, session.ended_at)}
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* Estado: ya despachado */}
              {appointment.dispatched_at ? (
                <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
                  {(appointment as { dispatch_type?: string | null }).dispatch_type === 'internal'
                    ? 'Entregado internamente'
                    : (appointment as { dispatch_type?: string | null }).dispatch_type === 'to_reception'
                      ? 'Despachado a papá'
                      : 'Entregado a papá'}
                </span>
              ) : (appointment as { handed_to_reception_at?: string | null }).handed_to_reception_at ? (
                /* Estado: en recepción esperando */
                <span className="text-[10px] text-amber-700 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>notifications</span>
                  En recepción desde{' '}
                  {new Date((appointment as { handed_to_reception_at: string }).handed_to_reception_at)
                    .toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : (
                /* Estado: pendiente — mostrar 3 botones */
                <>
                  <span className="text-[10px] text-fm-on-surface-variant mr-1">Entregar:</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await dispatchChild(appointment.id, 'internal')
                      if (!res.ok) alert(res.error)
                      else router.refresh()
                    })}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 disabled:opacity-60"
                    title="Pase a otra terapista — sin cargo"
                  >
                    ↪ Interna
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await handToReception(appointment.id)
                      if (!res.ok) alert(res.error)
                      else router.refresh()
                    })}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                    title="Recepción espera al papá — inicia timer de 15 min"
                  >
                    🔔 Recepción
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(async () => {
                      const res = await dispatchChild(appointment.id, 'to_parent')
                      if (!res.ok) alert(res.error)
                      else router.refresh()
                    })}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-60"
                    title="El papá ya está — despacho inmediato sin cargo"
                  >
                    ✓ A papá
                  </button>
                </>
              )}

              {onReportClick && session && (
                <ReportButton report={report ?? null} sessionId={session.id} onClick={onReportClick} />
              )}
              {onNoteClick && (
                <button
                  onClick={() => onNoteClick(appointment.id)}
                  className={`text-xs font-semibold underline-offset-2 hover:underline ${subtleClass}`}
                >
                  Dejar nota
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showAbsenceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest text-fm-on-surface rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Marcar inasistencia</h3>
              <p className="text-xs text-fm-on-surface-variant mt-1">
                El niño/a será marcado como no presentado y la directora recibirá una solicitud para reagendar la sesión.
              </p>
            </div>
            <textarea
              value={absenceReason}
              onChange={(e) => setAbsenceReason(e.target.value)}
              rows={3}
              placeholder="Motivo (opcional): ej. enfermo, padre avisó tarde…"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white dark:bg-fm-surface-container px-3 py-2 text-sm"
            />
            {absenceError && <p className="text-xs text-red-700">{absenceError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAbsenceModal(false)
                  setAbsenceReason('')
                  setAbsenceError(null)
                }}
                disabled={absencePending}
                className="px-3 py-1.5 text-sm rounded-lg hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAbsence}
                disabled={absencePending}
                className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
              >
                {absencePending ? 'Guardando…' : 'Confirmar inasistencia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
