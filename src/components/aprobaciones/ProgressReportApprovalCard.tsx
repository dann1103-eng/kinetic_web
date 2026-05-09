'use client'

import { useState, useTransition } from 'react'
import {
  approveProgressReport,
  rejectProgressReport,
} from '@/app/actions/progress-reports'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  ProgressReport,
  ProgressReportDataFlexible,
  ReportTemplate,
  ReportTemplateBlock,
  ServiceType,
} from '@/types/db'

interface ChildInfo {
  id: string
  full_name: string
  preferred_name: string | null
}

interface ProgressReportApprovalCardProps {
  report: ProgressReport
  child: ChildInfo | undefined
  authorName: string
  template: ReportTemplate | null
  onResolved: () => void
}

function renderBlockValue(
  data: ProgressReportDataFlexible,
  block: ReportTemplateBlock,
): React.ReactNode {
  const v = data[block.key]
  if (block.kind === 'rich_text') {
    if (typeof v !== 'string' || !v.trim()) {
      return <span className="text-fm-on-surface-variant italic">(vacío)</span>
    }
    return v
  }
  if (block.kind === 'numbered_list') {
    if (!Array.isArray(v) || v.every((x) => !x?.trim())) {
      return <span className="text-fm-on-surface-variant italic">(vacío)</span>
    }
    return (
      <ol className="list-decimal pl-5 space-y-0.5">
        {v.filter((x) => x?.trim()).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    )
  }
  return <span className="text-fm-on-surface-variant italic">(formato no soportado)</span>
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ProgressReportApprovalCard({
  report,
  child,
  authorName,
  template,
  onResolved,
}: ProgressReportApprovalCardProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [expanded, setExpanded] = useState(false)

  const childName = child?.preferred_name ?? child?.full_name ?? 'Paciente'
  const serviceLabel =
    SERVICE_TYPE_LABELS[report.service_type as ServiceType] ?? report.service_type

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      const res = await approveProgressReport(report.id)
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
      const res = await rejectProgressReport(report.id, reason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onResolved()
    })
  }

  const data = (report.data_json ?? {}) as ProgressReportDataFlexible
  const blocks = template?.blocks_json ?? []

  return (
    <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
            {formatDate(report.period_starts)} — {formatDate(report.period_ends)}
          </p>
          <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">
            {childName} · {serviceLabel}
          </h3>
          <p className="text-xs text-fm-on-surface-variant">
            Terapista: {authorName}
            {report.sessions_attended_count > 0 && (
              <> · {report.sessions_attended_count} sesiones asistidas</>
            )}
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

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium text-fm-primary hover:underline"
      >
        {expanded ? 'Ocultar contenido' : 'Ver contenido completo'}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-fm-outline-variant/15 pt-3">
          {blocks.length === 0 && (
            <p className="text-xs italic text-fm-on-surface-variant">
              No hay plantilla disponible para mostrar el contenido.
            </p>
          )}
          {blocks.map((block) => (
            <div key={block.key}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-0.5">
                {block.label}
              </p>
              <div className="text-sm text-fm-on-surface whitespace-pre-wrap">
                {renderBlockValue(data, block)}
              </div>
            </div>
          ))}
        </div>
      )}

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
            placeholder="Motivo del rechazo (mín. 10 caracteres)."
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
