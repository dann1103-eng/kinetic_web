import { createClient } from '@/lib/supabase/server'
import type { SessionReport, SessionReportStatus } from '@/types/db'
import { ReportFileDownloadButton } from './ReportFileDownloadButton'

interface ChildSessionReportsHistoryProps {
  childId: string
}

const STATUS_LABEL: Record<SessionReportStatus, string> = {
  draft: 'Borrador',
  submitted: 'Esperando aprobación',
  approved: 'Aprobado (no enviado a familia)',
  rejected: 'Rechazado',
  sent_to_family: 'Aprobado · enviado a familia',
}

const STATUS_BADGE: Record<SessionReportStatus, string> = {
  draft: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  submitted: 'bg-blue-500/10 text-blue-700',
  approved: 'bg-green-500/10 text-green-700',
  rejected: 'bg-fm-error/10 text-fm-error',
  sent_to_family: 'bg-green-500/10 text-green-700',
}

/**
 * Server component: lista todos los reportes de sesión del niño (todos los estados).
 * RLS gatea: staff ve todos; familia ve solo sent_to_family + visible_to_family.
 */
export async function ChildSessionReportsHistory({ childId }: ChildSessionReportsHistoryProps) {
  const supabase = await createClient()

  const { data: reportsRaw } = await supabase
    .from('session_reports')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(50)

  const reports = (reportsRaw ?? []) as SessionReport[]

  // Cargar nombres de terapistas y fechas de citas
  const therapistIds = Array.from(
    new Set(reports.map((r) => r.therapist_id).filter(Boolean) as string[]),
  )
  const appointmentIds = Array.from(new Set(reports.map((r) => r.appointment_id)))

  const [therapistsRes, appointmentsRes] = await Promise.all([
    therapistIds.length
      ? supabase.from('users').select('id, full_name').in('id', therapistIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    appointmentIds.length
      ? supabase
          .from('appointments')
          .select('id, starts_at, service_type')
          .in('id', appointmentIds)
      : Promise.resolve({ data: [] as { id: string; starts_at: string; service_type: string | null }[] }),
  ])

  const therapistMap = Object.fromEntries(
    (therapistsRes.data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]),
  )
  const appointmentMap = Object.fromEntries(
    (appointmentsRes.data ?? []).map((a: { id: string; starts_at: string; service_type: string | null }) => [
      a.id,
      a,
    ]),
  )

  if (reports.length === 0) {
    return (
      <div className="bg-fm-surface-container-lowest rounded-2xl border border-dashed border-fm-outline-variant/40 p-6 text-center">
        <p className="text-sm text-fm-on-surface-variant">
          Este niño/a aún no tiene reportes de sesión registrados.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const therapistName = report.therapist_id
          ? therapistMap[report.therapist_id] ?? '—'
          : '—'
        const appt = appointmentMap[report.appointment_id]
        const dateLabel = appt
          ? new Date(appt.starts_at).toLocaleString('es-SV', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : new Date(report.created_at).toLocaleString('es-SV', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
        const serviceLabel = appt?.service_type?.replace(/_/g, ' ') ?? null

        return (
          <details
            key={report.id}
            className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 group"
          >
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
                  {dateLabel}
                </p>
                <p className="text-sm text-fm-on-surface mt-0.5">
                  Terapista: <span className="font-medium">{therapistName}</span>
                  {serviceLabel && (
                    <span className="text-fm-on-surface-variant capitalize"> · {serviceLabel}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[report.status]}`}
                >
                  {STATUS_LABEL[report.status]}
                </span>
                <span className="material-symbols-outlined text-fm-on-surface-variant transition-transform group-open:rotate-180">
                  expand_more
                </span>
              </div>
            </summary>

            <div className="mt-4 pt-3 border-t border-fm-outline-variant/15 space-y-3">
              {report.status === 'rejected' && report.rejection_reason && (
                <div className="rounded-lg bg-fm-error/10 border border-fm-error/30 p-3 text-sm text-fm-error">
                  <p className="font-semibold text-xs uppercase tracking-wide mb-1">
                    Motivo del rechazo
                  </p>
                  <p className="whitespace-pre-wrap">{report.rejection_reason}</p>
                </div>
              )}

              {report.upload_kind === 'file' && report.file_url ? (
                <FilePreviewRow
                  fileName={report.file_name ?? 'Archivo subido'}
                  filePath={report.file_url}
                  fileSizeBytes={report.file_size_bytes}
                />
              ) : (
                <>
                  <ReadField label="Actividades" value={report.actividades} />
                  <ReadField label="Respuesta del niño/a" value={report.respuesta_del_nino} />
                  <ReadField label="Tarea para casa" value={report.tarea_para_casa} />
                  {report.observaciones_internas && (
                    <ReadField
                      label="Observaciones internas"
                      badge="Solo staff"
                      value={report.observaciones_internas}
                    />
                  )}
                </>
              )}

              <p className="text-[11px] text-fm-on-surface-variant pt-2">
                {report.visible_to_family ? (
                  <span className="text-green-700">✓ Visible para la familia</span>
                ) : (
                  <span>Solo interno (no visible para familia)</span>
                )}
              </p>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function ReadField({
  label,
  value,
  badge,
}: {
  label: string
  value: string
  badge?: string
}) {
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

function FilePreviewRow({
  fileName,
  filePath,
  fileSizeBytes,
}: {
  fileName: string
  filePath: string
  fileSizeBytes: number | null
}) {
  return (
    <div className="rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low/40 p-4 flex items-center gap-3">
      <span className="material-symbols-outlined text-fm-primary text-2xl" aria-hidden="true">
        description
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fm-on-surface truncate">{fileName}</p>
        {fileSizeBytes !== null && (
          <p className="text-xs text-fm-on-surface-variant">
            {(fileSizeBytes / 1024 / 1024).toFixed(2)} MB · Archivo del reporte
          </p>
        )}
      </div>
      <ReportFileDownloadButton path={filePath} />
    </div>
  )
}
