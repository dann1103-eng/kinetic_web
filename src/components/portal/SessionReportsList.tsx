import type { SessionReport } from '@/types/db'

interface SessionReportsListProps {
  reports: SessionReport[]
  childNamesById: Record<string, string>
}

/**
 * Family-facing list of approved + visible session reports.
 * Defense-in-depth: never renders `observaciones_internas` even if it leaks
 * into the props (the page already strips it from the SELECT, RLS also blocks).
 */
export function SessionReportsList({ reports, childNamesById }: SessionReportsListProps) {
  if (reports.length === 0) return null

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const childName = childNamesById[report.child_id] ?? 'Mi niño/a'
        const dateLabel = report.sent_to_family_at
          ? new Date(report.sent_to_family_at).toLocaleDateString('es-SV', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : ''

        return (
          <div
            key={report.id}
            className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
                  {dateLabel}
                </p>
                <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">{childName}</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-700">
                Reporte de sesión
              </span>
            </div>

            <div className="space-y-2 text-sm text-fm-on-surface">
              {report.actividades && (
                <ReportField label="Actividades" value={report.actividades} />
              )}
              {report.respuesta_del_nino && (
                <ReportField label="Respuesta del niño/a" value={report.respuesta_del_nino} />
              )}
              {report.tarea_para_casa && (
                <ReportField label="Tarea para casa" value={report.tarea_para_casa} highlight />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReportField({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-0.5">
        {label}
      </p>
      <p
        className={`whitespace-pre-wrap ${
          highlight
            ? 'rounded-lg bg-fm-primary/5 border border-fm-primary/20 px-3 py-2'
            : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}
