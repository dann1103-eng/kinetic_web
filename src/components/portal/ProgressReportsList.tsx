import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  ChildAttachment,
  ProgressReport,
  ProgressReportDataFlexible,
  ReportTemplate,
  ReportTemplateBlock,
  ServiceType,
} from '@/types/db'
import { ReportFileDownloadButton } from './ReportFileDownloadButton'
import { ChildAttachmentDownloadButton } from './ChildAttachmentDownloadButton'

interface ProgressReportsListProps {
  reports: ProgressReport[]
  childNamesById: Record<string, string>
  templateMap: Record<string, ReportTemplate>
  /** Adjuntos visibles a familia agrupados por progress_report_id. */
  attachmentsByReportId?: Record<string, ChildAttachment[]>
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
  attachmentsByReportId,
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
        const reportFlex = report as ProgressReport & {
          upload_kind?: 'editor' | 'file' | null
          file_url?: string | null
          file_name?: string | null
          family_notes?: string | null
        }
        const hasFile = reportFlex.upload_kind === 'file' && !!reportFlex.file_url
        const familyNotes = reportFlex.family_notes?.trim() || null
        const extraAttachments = attachmentsByReportId?.[report.id] ?? []

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

            <div className="mt-4 pt-3 border-t border-fm-outline-variant/15 space-y-4">
              {/* Modo file-only (refactor file): mostrar download + notas para la familia */}
              {hasFile && (
                <div className="space-y-2">
                  <ReportFileDownloadButton
                    filePath={reportFlex.file_url as string}
                    fileName={reportFlex.file_name ?? 'informe.pdf'}
                    label="Descargar informe"
                  />
                </div>
              )}
              {familyNotes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                    Notas del terapista
                  </p>
                  <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{familyNotes}</p>
                </div>
              )}

              {/* Modo editor legacy: renderizar blocks del template */}
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

              {/* Documentos adicionales (mig 0119) */}
              {extraAttachments.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1.5">
                    Documentos adicionales
                  </p>
                  <ul className="space-y-1.5">
                    {extraAttachments.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center gap-2 rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-low px-3 py-2"
                      >
                        <span
                          className="material-symbols-outlined text-kp-primary flex-shrink-0"
                          style={{ fontSize: '18px' }}
                        >
                          attach_file
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-fm-on-surface truncate">
                            {att.title?.trim() || att.file_name}
                          </p>
                          {att.description && (
                            <p className="text-[11px] text-fm-on-surface-variant truncate">
                              {att.description}
                            </p>
                          )}
                        </div>
                        <ChildAttachmentDownloadButton attachmentId={att.id} compact />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fallback solo si NO hay archivo, NO hay notas, NO hay blocks renderizados Y NO hay adjuntos */}
              {!hasFile && !familyNotes && blocks.length === 0 && extraAttachments.length === 0 && (
                <p className="text-xs italic text-fm-on-surface-variant">
                  El informe está disponible pero no podemos mostrar el detalle ahora. Contactá a la clínica.
                </p>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
