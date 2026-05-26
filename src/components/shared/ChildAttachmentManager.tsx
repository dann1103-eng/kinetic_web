'use client'

import { useState, useTransition, useRef } from 'react'
import {
  uploadChildAttachment,
  removeChildAttachment,
  updateChildAttachmentMeta,
} from '@/app/actions/child-attachments'
import { CHILD_ATTACHMENT_KIND_LABELS } from '@/types/db'
import type { ChildAttachment, ChildAttachmentKind } from '@/types/db'

interface Props {
  childId: string
  attachments: ChildAttachment[]
  /** Vínculo opcional: solo uno se setea por carga. */
  link?: {
    appointmentId?: string
    sessionReportId?: string
    progressReportId?: string
  }
  /** Kind por defecto al subir. */
  defaultKind?: ChildAttachmentKind
  /** Si la familia debe verlo por defecto. */
  defaultVisibleToFamily?: boolean
  /** Texto para el bloque (ej. "Adjuntos de la sesión", "Documentos adicionales"). */
  title?: string
  /** Lista cerrada de kinds permitidos en el selector. */
  allowedKinds?: ChildAttachmentKind[]
  /** Llamado luego de cualquier mutación exitosa (subida o borrado). */
  onChange?: () => void
  /** Mostrar solo lectura (sin upload/delete). */
  readOnly?: boolean
}

const DEFAULT_KINDS: ChildAttachmentKind[] = [
  'tarea',
  'evaluacion',
  'imagen',
  'informe_adicional',
  'otro',
]

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Bloque reutilizable para staff: lista adjuntos del niño filtrados por
 * vínculo (cita / informe sesión / informe cuatrimestral), permite subir
 * uno nuevo con tipo + título opcional, y borrar los existentes.
 *
 * No re-fetcha del servidor: revalidatePath en los actions actualiza la
 * ruta cuando se navega. Para refresh inmediato pasar `onChange` que llame
 * router.refresh().
 */
export function ChildAttachmentManager({
  childId,
  attachments,
  link,
  defaultKind = 'otro',
  defaultVisibleToFamily = true,
  title = 'Adjuntos',
  allowedKinds = DEFAULT_KINDS,
  onChange,
  readOnly = false,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<ChildAttachmentKind>(defaultKind)
  const [titleInput, setTitleInput] = useState('')
  const [visibleToFamily, setVisibleToFamily] = useState(defaultVisibleToFamily)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    // Validación client-side: feedback inmediato antes de subir.
    // El límite real es 15 MB en server, pero el límite de Server Action body
    // es 25 MB (config en next.config.ts). 14 MB nos deja margen para FormData overhead.
    const MAX_BYTES = 14 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      setError(`El archivo es muy grande (${mb} MB). Máximo 14 MB. Reducí la calidad de la foto o usá un PDF más liviano.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const formData = new FormData()
    formData.set('file', file)
    formData.set('childId', childId)
    formData.set('kind', selectedKind)
    if (titleInput.trim()) formData.set('title', titleInput.trim())
    formData.set('visibleToFamily', visibleToFamily ? 'true' : 'false')
    if (link?.appointmentId) formData.set('appointmentId', link.appointmentId)
    if (link?.sessionReportId) formData.set('sessionReportId', link.sessionReportId)
    if (link?.progressReportId) formData.set('progressReportId', link.progressReportId)

    startTransition(async () => {
      const res = await uploadChildAttachment(formData)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setTitleInput('')
      if (fileRef.current) fileRef.current.value = ''
      onChange?.()
    })
  }

  function handleRemove(attachmentId: string) {
    if (!confirm('¿Borrar este adjunto?')) return
    startTransition(async () => {
      const res = await removeChildAttachment(attachmentId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onChange?.()
    })
  }

  function handleToggleVisibility(att: ChildAttachment) {
    startTransition(async () => {
      const res = await updateChildAttachmentMeta(att.id, {
        visible_to_family: !att.visible_to_family,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onChange?.()
    })
  }

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
        {title}
      </h4>

      {attachments.length === 0 && (
        <p className="text-xs italic text-fm-on-surface-variant">
          Aún no hay adjuntos.
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest px-3 py-2"
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
                <p className="text-[11px] text-fm-on-surface-variant truncate">
                  {CHILD_ATTACHMENT_KIND_LABELS[att.kind]} · {formatDateShort(att.created_at)}
                  {att.file_size_bytes ? ` · ${formatSize(att.file_size_bytes)}` : ''}
                </p>
              </div>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(att)}
                    disabled={isPending}
                    className="text-fm-on-surface-variant hover:text-fm-on-surface disabled:opacity-50"
                    title={
                      att.visible_to_family
                        ? 'Visible a la familia (click para ocultar)'
                        : 'Oculto a la familia (click para mostrar)'
                    }
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '18px' }}
                    >
                      {att.visible_to_family ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(att.id)}
                    disabled={isPending}
                    className="text-fm-error hover:opacity-80 disabled:opacity-50"
                    title="Borrar adjunto"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '18px' }}
                    >
                      delete
                    </span>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value as ChildAttachmentKind)}
              disabled={isPending}
              className="text-xs px-2 py-1 rounded-md border border-fm-outline-variant/40 bg-fm-surface-container-lowest text-fm-on-surface"
            >
              {allowedKinds.map((k) => (
                <option key={k} value={k}>
                  {CHILD_ATTACHMENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Título (opcional)"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={isPending}
              className="flex-1 min-w-[140px] text-xs px-2 py-1 rounded-md border border-fm-outline-variant/40 bg-fm-surface-container-lowest text-fm-on-surface"
            />
            <label className="inline-flex items-center gap-1 text-xs text-fm-on-surface-variant">
              <input
                type="checkbox"
                checked={visibleToFamily}
                onChange={(e) => setVisibleToFamily(e.target.checked)}
                disabled={isPending}
              />
              Visible a familia
            </label>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-kp-primary hover:opacity-80">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={isPending}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.heic,.heif,image/*"
            />
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px' }}
            >
              {isPending ? 'progress_activity' : 'upload'}
            </span>
            {isPending ? 'Subiendo…' : 'Subir adjunto'}
          </label>
        </div>
      )}

      {error && <p className="text-xs text-fm-error">{error}</p>}
    </div>
  )
}
