import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ProgressReport, ProgressReportStatus, ServiceType } from '@/types/db'

interface ChildProgressReportsHistoryProps {
  familyId: string
  childId: string
}

const STATUS_LABEL: Record<ProgressReportStatus, string> = {
  draft: 'Borrador',
  submitted: 'Esperando aprobación',
  approved: 'Aprobado (no enviado a familia)',
  rejected: 'Rechazado',
  sent_to_family: 'Aprobado · enviado a familia',
}

const STATUS_BADGE: Record<ProgressReportStatus, string> = {
  draft: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  submitted: 'bg-blue-500/10 text-blue-700',
  approved: 'bg-green-500/10 text-green-700',
  rejected: 'bg-fm-error/10 text-fm-error',
  sent_to_family: 'bg-green-500/10 text-green-700',
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export async function ChildProgressReportsHistory({
  familyId,
  childId,
}: ChildProgressReportsHistoryProps) {
  const supabase = await createClient()

  const { data: reportsRaw } = await supabase
    .from('progress_reports')
    .select('*')
    .eq('child_id', childId)
    .order('period_ends', { ascending: false })
    .limit(50)

  const reports = (reportsRaw ?? []) as ProgressReport[]

  const authorIds = Array.from(
    new Set(reports.map((r) => r.authored_by_user_id).filter(Boolean) as string[]),
  )
  const { data: authorsRaw } = authorIds.length
    ? await supabase.from('users').select('id, full_name').in('id', authorIds)
    : { data: [] as { id: string; full_name: string }[] }
  const authorMap = Object.fromEntries(
    (authorsRaw ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]),
  )

  if (reports.length === 0) {
    return (
      <div className="bg-fm-surface-container-lowest rounded-2xl border border-dashed border-fm-outline-variant/40 p-6 text-center">
        <p className="text-sm text-fm-on-surface-variant">
          Aún no hay informes de avances para este niño/a.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {reports.map((report) => {
        const serviceLabel =
          SERVICE_TYPE_LABELS[report.service_type as ServiceType] ?? report.service_type
        const authorName = report.authored_by_user_id
          ? authorMap[report.authored_by_user_id] ?? '—'
          : '—'

        return (
          <Link
            key={report.id}
            href={`/familias/${familyId}/children/${childId}/informe-avances/${report.id}`}
            className="block rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 hover:border-fm-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
                  {formatDate(report.period_starts)} — {formatDate(report.period_ends)}
                </p>
                <h3 className="text-sm font-semibold text-fm-on-surface mt-0.5">
                  Informe de {serviceLabel}
                </h3>
                <p className="text-xs text-fm-on-surface-variant">
                  Terapista: {authorName} ·{' '}
                  {report.sessions_attended_count > 0
                    ? `${report.sessions_attended_count} sesiones asistidas`
                    : 'Sesiones no contabilizadas'}
                </p>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[report.status]}`}
              >
                {STATUS_LABEL[report.status]}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
