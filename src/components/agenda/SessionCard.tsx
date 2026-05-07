'use client'

import { useEffect, useState, useTransition } from 'react'
import { startTherapySession, finishTherapySession } from '@/app/actions/therapy-sessions'
import type { Appointment, TherapySession, SessionReport } from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

interface SessionCardProps {
  appointment: AppointmentWithChild
  session: TherapySession | null
  report?: SessionReport | null
  /** Click on "Dejar nota" — opens journal entries panel for the child. */
  onNoteClick?: (appointmentId: string) => void
  /** Click on "Llenar reporte" / "Corregir" / "Ver reporte" — opens session report modal. */
  onReportClick?: (sessionId: string) => void
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatDuration(started: string, ended: string): string {
  const mins = Math.round(
    (new Date(ended).getTime() - new Date(started).getTime()) / 60000
  )
  return `${mins} min`
}

export function SessionCard({ appointment, session, report, onNoteClick, onReportClick }: SessionCardProps) {
  const [, setTick] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Re-render every second only when a session is actively running
  useEffect(() => {
    if (appointment.status !== 'in_progress' || !session) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [appointment.status, session])

  // Drift-free: always derived from started_at, never accumulated in state
  const elapsed = session?.started_at
    ? Math.floor((new Date().getTime() - new Date(session.started_at).getTime()) / 1000)
    : 0

  const childName = appointment.child_preferred_name ?? appointment.child_full_name ?? 'Paciente'
  const timeLabel = new Date(appointment.starts_at).toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
  })

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
      if (!result.ok && !result.alreadyFinished) alert(result.error)
    })
  }

  return (
    <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
            {timeLabel}
          </p>
          <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">{childName}</h3>
          {appointment.service_type && (
            <p className="text-sm text-fm-on-surface-variant capitalize">
              {appointment.service_type.replace(/_/g, ' ')}
            </p>
          )}
        </div>

        {(appointment.status === 'no_show' || appointment.status === 'late_cancel') && (
          <span className="text-xs font-medium bg-fm-error/10 text-fm-error px-2 py-1 rounded-full">
            {appointment.status === 'no_show' ? 'No se presentó' : 'Cancelación tardía'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {appointment.status === 'scheduled' && (
          <button
            onClick={handleStart}
            disabled={isPending}
            className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {isPending ? 'Iniciando…' : 'Iniciar sesión'}
          </button>
        )}

        {appointment.status === 'in_progress' && session && (
          <>
            <div className="font-mono text-xl font-bold text-fm-on-surface tabular-nums">
              {formatElapsed(elapsed)}
            </div>
            <button
              onClick={handleFinish}
              disabled={isPending}
              className="flex-1 py-2 rounded-xl bg-fm-error text-white text-sm font-semibold disabled:opacity-50 hover:bg-fm-error/90 transition-colors"
            >
              {isPending ? 'Finalizando…' : 'Finalizar'}
            </button>
          </>
        )}

        {appointment.status === 'completed' && session?.ended_at && (
          <>
            <div className="flex items-center gap-2 text-sm text-fm-on-surface-variant">
              <span className="material-symbols-outlined text-green-600" style={{ fontSize: '18px' }}>
                check_circle
              </span>
              {formatDuration(session.started_at, session.ended_at)}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {onReportClick && session && <ReportButton report={report} sessionId={session.id} onClick={onReportClick} />}
              {onNoteClick && (
                <button
                  onClick={() => onNoteClick(appointment.id)}
                  className="text-xs font-medium text-fm-on-surface-variant hover:text-fm-primary hover:underline"
                >
                  Dejar nota
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface ReportButtonProps {
  report: SessionReport | null | undefined
  sessionId: string
  onClick: (sessionId: string) => void
}

function ReportButton({ report, sessionId, onClick }: ReportButtonProps) {
  const status = report?.status

  if (!report || status === 'draft') {
    return (
      <button
        onClick={() => onClick(sessionId)}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 transition-colors"
      >
        Llenar reporte
      </button>
    )
  }

  if (status === 'submitted') {
    return (
      <button
        onClick={() => onClick(sessionId)}
        className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 transition-colors"
      >
        Esperando aprobación · Ver
      </button>
    )
  }

  if (status === 'approved' || status === 'sent_to_family') {
    return (
      <button
        onClick={() => onClick(sessionId)}
        className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors"
      >
        Reporte aprobado · Ver
      </button>
    )
  }

  if (status === 'rejected') {
    return (
      <button
        onClick={() => onClick(sessionId)}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-fm-error text-white hover:bg-fm-error/90 transition-colors"
      >
        Corregir reporte
      </button>
    )
  }

  return null
}
