import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  ProgressReport,
  ProgressReportDataFlexible,
  ReportTemplate,
  ReportTemplateBlock,
  ServiceType,
} from '@/types/db'

interface ProgressReportsListProps {
  reports: ProgressReport[]
  childNamesById: Record<string, string>
  templateMap: Record<string, ReportTemplate>
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function renderBlockValue(
  data: ProgressReportDataFlexible,
  block: ReportTemplateBlock,
): React.ReactNode {
  const v = data[block.key]
  if (block.kind === 'rich_text') {
    if (typeof v !== 'string' || !v.trim()) return null
    return <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{v}</p>
  }
  if (block.kind === 'numbered_list') {
    if (!Array.isArray(v)) return null
    const items = v.filter((x) => typeof x === 'string' && x.trim())
    if (items.length === 0) return null
    return (
      <ol className="list-decimal pl-5 space-y-0.5 text-sm text-fm-on-surface">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    )
  }
  return null
}

/**
 * Family-facing: lista los informes de avances aprobados y enviados a la familia.
 * Renderiza dinámicamente desde el template asignado al reporte.
 */
export function ProgressReportsList({
  reports,
  childNamesById,
  templateMap,
}: ProgressReportsListProps) {
  if (reports.length === 0) return null

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const childName = childNamesById[report.child_id] ?? 'Mi niño/a'
        const serviceLabel =
          SERVICE_TYPE_LABELS[report.service_type as ServiceType] ?? report.service_type
        const data = (report.data_json ?? {}) as ProgressReportDataFlexible
        const template = report.template_id ? templateMap[report.template_id] : null
        const blocks = template?.blocks_json ?? []

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
              {blocks.length === 0 && (
                <p className="text-xs italic text-fm-on-surface-variant">
                  El informe está disponible pero no podemos mostrar el detalle ahora. Contactá a la clínica.
                </p>
              )}
              {blocks.map((block) => {
                const rendered = renderBlockValue(data, block)
                if (!rendered) return null
                return (
                  <div key={block.key}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-0.5">
                      {block.label}
                    </p>
                    {rendered}
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
