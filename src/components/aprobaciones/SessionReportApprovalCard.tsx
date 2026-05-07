'use client'

import { useState, useTransition } from 'react'
import { approveSessionReport, rejectSessionReport } from '@/app/actions/session-reports'
import type { SessionReport } from '@/types/db'

interface ChildInfo {
  id: string
  full_name: string
  preferred_name: string | null
}

interface AppointmentInfo {
  id: string
  starts_at: string
  service_type: string | null
}

interface SessionReportApprovalCardProps {
  report: SessionReport
  child: ChildInfo | undefined
  therapistName: string
  appointment: AppointmentInfo | undefined
  onResolved: () => void
}

export function SessionReportApprovalCard({
  report,
  child,
  therapistName,
  appointment,
  onResolved,
}: SessionReportApprovalCardProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const childName = child?.preferred_name ?? child?.full_name ?? 'Paciente'
  const dateLabel = appointment
    ? new Date(appointment.starts_at).toLocaleString('es-SV', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
  const serviceLabel = appointment?.service_type?.replace(/_/g, ' ') ?? null

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      const res = await approveSessionReport(report.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onResolved()
    })
  }

  const handleConfirmReject = () => {
    setError(null)
    if (reason.trim().length < 10) {
      setError('El motivo debe tener al menos 10 caracteres.')
      return
    }
    startTransition(async () => {
      const res = await rejectSessionReport(report.id, reason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onResolved()
    })
  }

  return (
    <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-fm-on-surface">{childName}</h3>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            {dateLabel}
            {serviceLabel && <span className="capitalize"> · {serviceLabel}</span>}
            <span> · Terapista: {therapistName}</span>
          </p>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            report.visible_to_family
              ? 'bg-green-500/10 text-green-700'
              : 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant'
          }`}
        >
          {report.visible_to_family ? 'Visible para familia' : 'Solo interno'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm">
        <Field label="Actividades" value={report.actividades} />
        <Field label="Respuesta del niño/a" value={report.respuesta_del_nino} />
        <Field label="Tarea para casa" value={report.tarea_para_casa} />
        {report.observaciones_internas && (
          <Field
            label="Observaciones internas"
            value={report.observaciones_internas}
            badge="Solo staff"
          />
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">{error}</div>
      )}

      {!rejecting ? (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {isPending ? 'Aprobando…' : 'Aprobar'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={isPending}
            className="flex-1 py-2 rounded-xl border border-fm-error/40 text-fm-error text-sm font-medium hover:bg-fm-error/5 disabled:opacity-50 transition-colors"
          >
            Rechazar
          </button>
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Motivo del rechazo (mín. 10 caracteres). La terapista lo verá al editar."
            className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 resize-none focus:outline-none focus:ring-2 focus:ring-fm-error/30"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRejecting(false)
                setReason('')
                setError(null)
              }}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              disabled={isPending}
              className="ml-auto px-4 py-2 rounded-xl bg-fm-error text-white text-sm font-semibold disabled:opacity-50 hover:bg-fm-error/90 transition-colors"
            >
              {isPending ? 'Rechazando…' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  badge?: string
}

function Field({ label, value, badge }: FieldProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
          {label}
        </span>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-fm-on-surface-variant/10 text-fm-on-surface-variant">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-fm-on-surface whitespace-pre-wrap">
        {value || <span className="text-fm-on-surface-variant italic">(vacío)</span>}
      </p>
    </div>
  )
}
