import { PROGRESS_REPORT_SECTIONS } from '@/lib/domain/progress-report-template'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ProgressReport, ServiceType, ProgressReportData } from '@/types/db'

interface ProgressReportsListProps {
  reports: ProgressReport[]
  childNamesById: Record<string, string>
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Family-facing: lista los informes de avances aprobados y enviados a la familia.
 * Las secciones que la familia NO debe ver son ninguna en C1 — todo el contenido
 * de progress_reports.data_json es info para la familia. RLS también filtra.
 */
export function ProgressReportsList({ reports, childNamesById }: ProgressReportsListProps) {
  if (reports.length === 0) return null

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const childName = childNamesById[report.child_id] ?? 'Mi niño/a'
        const serviceLabel =
          SERVICE_TYPE_LABELS[report.service_type as ServiceType] ?? report.service_type
        const data = (report.data_json ?? {}) as ProgressReportData

        return (
          <details
            key={report.id}
            className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 group"
          >
            <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
                  {formatDate(report.period_starts)} — {formatDate(report.period_ends)}
                </p>
                <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">
                  {childName} · {serviceLabel}
                </h3>
                <p className="text-xs text-fm-on-surface-variant mt-0.5">
                  Informe de avances cuatrimestral
                </p>
              </div>
              <span className="material-symbols-outlined text-fm-on-surface-variant transition-transform group-open:rotate-180">
                expand_more
              </span>
            </summary>

            <div className="mt-4 pt-3 border-t border-fm-outline-variant/15 space-y-3">
              {PROGRESS_REPORT_SECTIONS.map((section) => {
                const value = data[section.key]
                if (!value || !value.trim()) return null
                return (
                  <div key={section.key}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-0.5">
                      {section.label}
                    </p>
                    <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{value}</p>
                  </div>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
