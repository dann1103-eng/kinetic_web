'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateProgressReportDraft,
  submitProgressReport,
} from '@/app/actions/progress-reports'
import type {
  ProgressReport,
  ProgressReportData,
  ProgressReportDataFlexible,
  ProgressReportDataValue,
  ReportTemplate,
  ReportTemplateBlock,
} from '@/types/db'

interface ChildHeaderInfo {
  full_name: string
  preferred_name: string | null
  code: string | null
  birth_date: string | null
  school_name: string | null
  school_grade: string | null
  diagnoses_display_text: string | null
}

interface ProgressReportEditorProps {
  report: ProgressReport
  child: ChildHeaderInfo
  authorName: string
  serviceLabel: string
  template: ReportTemplate
}

const STATUS_LABEL: Record<ProgressReport['status'], string> = {
  draft: 'Borrador',
  submitted: 'Enviado, esperando aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent_to_family: 'Enviado a la familia',
}

const STATUS_BADGE: Record<ProgressReport['status'], string> = {
  draft: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  submitted: 'bg-blue-500/10 text-blue-700',
  approved: 'bg-green-500/10 text-green-700',
  rejected: 'bg-fm-error/10 text-fm-error',
  sent_to_family: 'bg-green-500/10 text-green-700',
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  return Math.floor(
    (new Date().getTime() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  )
}

/** Convierte data_json (legacy o nueva) a la forma flexible. */
function toFlexible(data: ProgressReportData | ProgressReportDataFlexible | null): ProgressReportDataFlexible {
  if (!data) return {}
  return data as ProgressReportDataFlexible
}

/** Lectura segura: devuelve string para rich_text, string[] para numbered_list. */
function readBlockValue(
  data: ProgressReportDataFlexible,
  block: ReportTemplateBlock,
): ProgressReportDataValue {
  const v = data[block.key]
  if (block.kind === 'rich_text') {
    return typeof v === 'string' ? v : ''
  }
  if (block.kind === 'numbered_list') {
    if (Array.isArray(v)) return v
    if (typeof v === 'string' && v) return [v]
    return ['']
  }
  // Otros kinds (recommendations_by_area, categorized_text) — placeholder
  return v ?? ''
}

/** Valida que un bloque required tenga contenido no vacío. */
function isBlockEmpty(value: ProgressReportDataValue, kind: ReportTemplateBlock['kind']): boolean {
  if (kind === 'rich_text') {
    return typeof value !== 'string' || value.trim() === ''
  }
  if (kind === 'numbered_list') {
    if (!Array.isArray(value)) return true
    return value.every((item) => typeof item !== 'string' || item.trim() === '')
  }
  return false
}

export function ProgressReportEditor({
  report,
  child,
  authorName,
  serviceLabel,
  template,
}: ProgressReportEditorProps) {
  const router = useRouter()
  const [data, setData] = useState<ProgressReportDataFlexible>(toFlexible(report.data_json))
  const [periodStarts, setPeriodStarts] = useState(report.period_starts)
  const [periodEnds, setPeriodEnds] = useState(report.period_ends)
  const [sessionsAttendedCount, setSessionsAttendedCount] = useState(
    report.sessions_attended_count ?? 0,
  )
  const [visibleToFamily, setVisibleToFamily] = useState(report.visible_to_family)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [currentStatus, setCurrentStatus] = useState(report.status)
  const [currentRejectionReason, setCurrentRejectionReason] = useState(report.rejection_reason)

  const isEditable = currentStatus === 'draft' || currentStatus === 'rejected'

  const setField = (key: string, value: ProgressReportDataValue) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveDraft = () => {
    setError(null)
    startTransition(async () => {
      const res = await updateProgressReportDraft(report.id, {
        data: data as unknown as ProgressReportData,
        visibleToFamily,
        sessionsAttendedCount,
        periodStarts,
        periodEnds,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSavedAt(new Date())
    })
  }

  const handleSubmit = () => {
    setError(null)
    // Validación cliente: bloques required del template.
    const blocks = template.blocks_json ?? []
    for (const block of blocks) {
      if (block.required) {
        const value = readBlockValue(data, block)
        if (isBlockEmpty(value, block.kind)) {
          setError(`Llená la sección obligatoria: ${block.label}.`)
          return
        }
      }
    }

    startTransition(async () => {
      const upd = await updateProgressReportDraft(report.id, {
        data: data as unknown as ProgressReportData,
        visibleToFamily,
        sessionsAttendedCount,
        periodStarts,
        periodEnds,
      })
      if (!upd.ok) {
        setError(upd.error)
        return
      }
      const sub = await submitProgressReport(report.id)
      if (!sub.ok) {
        setError(sub.error)
        return
      }
      setCurrentStatus(sub.report.status)
      setCurrentRejectionReason(sub.report.rejection_reason)
      router.refresh()
    })
  }

  const age = calcAge(child.birth_date)
  const childDisplayName = child.preferred_name ?? child.full_name
  const blocks = template.blocks_json ?? []

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
              Informe de avances · {serviceLabel}
            </p>
            <p className="text-[10px] text-fm-on-surface-variant mt-0.5">
              Plantilla: {template.name}
            </p>
            <h1 className="text-xl font-bold text-fm-on-surface mt-0.5">
              {child.full_name}
              {child.code && (
                <span className="ml-2 text-xs font-mono text-fm-on-surface-variant bg-fm-surface-container px-2 py-0.5 rounded">
                  {child.code}
                </span>
              )}
            </h1>
            {child.preferred_name && (
              <p className="text-sm text-fm-on-surface-variant italic">&ldquo;{childDisplayName}&rdquo;</p>
            )}
            <p className="text-xs text-fm-on-surface-variant mt-1">
              {age !== null && <>{age} años · </>}
              {child.school_name && <>{child.school_name}</>}
              {child.school_grade && <> ({child.school_grade})</>}
            </p>
            {child.diagnoses_display_text && (
              <p className="text-xs text-fm-primary italic mt-1">{child.diagnoses_display_text}</p>
            )}
          </div>
          <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[currentStatus]}`}>
            {STATUS_LABEL[currentStatus]}
          </span>
        </div>

        <p className="text-xs text-fm-on-surface-variant pt-2 border-t border-fm-outline-variant/15">
          Terapista responsable: <span className="font-medium text-fm-on-surface">{authorName}</span>
        </p>
      </header>

      {currentStatus === 'rejected' && currentRejectionReason && (
        <div className="rounded-xl border border-fm-error/40 bg-fm-error/10 p-4 text-sm text-fm-error">
          <p className="font-semibold">La directora rechazó este informe:</p>
          <p className="mt-1 whitespace-pre-wrap">{currentRejectionReason}</p>
          <p className="mt-2 text-xs">Corregí lo señalado y volvé a enviar a aprobación.</p>
        </div>
      )}

      <section className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5 space-y-3">
        <h2 className="text-sm font-semibold text-fm-on-surface">Datos del período</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Inicio del período">
            <input
              type="date"
              value={periodStarts}
              onChange={(e) => setPeriodStarts(e.target.value)}
              disabled={!isEditable || isPending}
              className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface disabled:opacity-60"
            />
          </FormField>
          <FormField label="Fin del período">
            <input
              type="date"
              value={periodEnds}
              onChange={(e) => setPeriodEnds(e.target.value)}
              disabled={!isEditable || isPending}
              className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface disabled:opacity-60"
            />
          </FormField>
          <FormField label="Sesiones asistidas">
            <input
              type="number"
              min={0}
              value={sessionsAttendedCount}
              onChange={(e) => setSessionsAttendedCount(Number(e.target.value))}
              disabled={!isEditable || isPending}
              className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface disabled:opacity-60"
            />
          </FormField>
        </div>
      </section>

      {/* Bloques del template (rich_text + numbered_list) */}
      {blocks.map((block) => (
        <BlockSection
          key={block.key}
          block={block}
          value={readBlockValue(data, block)}
          disabled={!isEditable || isPending}
          onChange={(v) => setField(block.key, v)}
        />
      ))}

      <section className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5">
        <label className="flex items-center gap-2 text-sm text-fm-on-surface select-none cursor-pointer">
          <input
            type="checkbox"
            checked={visibleToFamily}
            onChange={(e) => setVisibleToFamily(e.target.checked)}
            disabled={!isEditable || isPending}
            className="rounded"
          />
          Visible para la familia (al aprobar se les envía automáticamente)
        </label>
      </section>

      {error && (
        <div className="rounded-lg bg-fm-error/10 px-4 py-3 text-sm text-fm-error">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700">
          Borrador guardado{' '}
          {savedAt.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}.
        </div>
      )}

      {isEditable && (
        <div className="sticky bottom-0 -mx-4 md:mx-0 px-4 md:px-0 py-3 bg-fm-background/95 backdrop-blur border-t border-fm-outline-variant/15 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Enviando…' : 'Enviar a aprobación'}
          </button>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

interface BlockSectionProps {
  block: ReportTemplateBlock
  value: ProgressReportDataValue
  disabled: boolean
  onChange: (v: ProgressReportDataValue) => void
}

function BlockSection({ block, value, disabled, onChange }: BlockSectionProps) {
  return (
    <section className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-fm-on-surface">
          {block.label}
          {block.required && <span className="text-fm-error"> *</span>}
        </h2>
        {!block.required && (
          <span className="text-[10px] text-fm-on-surface-variant">Opcional</span>
        )}
      </div>
      {block.description && (
        <p className="text-xs text-fm-on-surface-variant">{block.description}</p>
      )}

      {block.kind === 'rich_text' && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={5}
          placeholder={block.placeholder}
          className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 resize-y focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-60"
        />
      )}

      {block.kind === 'numbered_list' && (
        <NumberedListEditor
          items={Array.isArray(value) ? value : ['']}
          disabled={disabled}
          placeholder={block.placeholder}
          onChange={onChange}
        />
      )}

      {block.kind !== 'rich_text' && block.kind !== 'numbered_list' && (
        <p className="text-xs italic text-fm-on-surface-variant">
          Tipo de bloque &ldquo;{block.kind}&rdquo; aún no soportado en el editor.
        </p>
      )}
    </section>
  )
}

function NumberedListEditor({
  items,
  disabled,
  placeholder,
  onChange,
}: {
  items: string[]
  disabled: boolean
  placeholder?: string
  onChange: (v: string[]) => void
}) {
  function update(idx: number, value: string) {
    onChange(items.map((it, i) => (i === idx ? value : it)))
  }
  function add() {
    onChange([...items, ''])
  }
  function remove(idx: number) {
    onChange(items.length === 1 ? [''] : items.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="text-xs text-fm-on-surface-variant pt-2 w-5 text-right">{idx + 1}.</span>
          <textarea
            value={item}
            onChange={(e) => update(idx, e.target.value)}
            disabled={disabled}
            rows={1}
            placeholder={idx === 0 ? placeholder : undefined}
            className="flex-1 rounded-lg border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-1.5 text-sm text-fm-on-surface resize-y focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            disabled={disabled || items.length === 1}
            className="text-xs text-fm-on-surface-variant hover:text-red-600 disabled:opacity-30 px-1 pt-1.5"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="text-xs text-fm-primary hover:underline disabled:opacity-50"
      >
        + Agregar item
      </button>
    </div>
  )
}
