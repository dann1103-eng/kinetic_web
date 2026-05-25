'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  updateSessionReportDraft,
  submitSessionReport,
  deleteSessionReport,
} from '@/app/actions/session-reports'
import {
  uploadSessionReportFile,
  removeSessionReportFile,
  getReportFileSignedUrl,
} from '@/app/actions/report-files'
import type { SessionReport } from '@/types/db'
import { ChildAttachmentManagerLazy } from '@/components/shared/ChildAttachmentManagerLazy'
import { useUser } from '@/contexts/UserContext'

const SUPER_EDITOR_ROLES = ['admin', 'coordinadora_familias', 'coordinadora_terapias']

interface SessionReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: SessionReport
  childName: string
  /** Llamado cuando el reporte se actualiza (parent puede refrescar su state). */
  onReportUpdated?: (report: SessionReport) => void
  /** Llamado cuando el reporte se elimina (draft). Parent debe quitar el reporte de su estado. */
  onDeleted?: () => void
}

const STATUS_LABEL: Record<SessionReport['status'], string> = {
  draft: 'Borrador',
  submitted: 'Enviado, esperando aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent_to_family: 'Enviado a la familia',
}

type Mode = 'editor' | 'file'

export function SessionReportModal({
  open,
  onOpenChange,
  report,
  childName,
  onReportUpdated,
  onDeleted,
}: SessionReportModalProps) {
  const [mode, setMode] = useState<Mode>(report.upload_kind ?? 'editor')
  const [actividades, setActividades] = useState(report.actividades)
  const [respuesta, setRespuesta] = useState(report.respuesta_del_nino)
  const [tarea, setTarea] = useState(report.tarea_para_casa)
  const [observaciones, setObservaciones] = useState(
    report.observaciones_internas,
  )
  const [visibleToFamily, setVisibleToFamily] = useState(
    report.visible_to_family,
  )
  const [fileName, setFileName] = useState<string | null>(report.file_name)
  const [filePath, setFilePath] = useState<string | null>(report.file_url)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState(false)

  const currentUser = useUser()
  const isSuperEditor = SUPER_EDITOR_ROLES.includes(currentUser.role)
  // Editable si está en borrador / rechazado (flujo normal) o si el usuario
  // actual es admin / coordinadora (puede modificar cualquier reporte).
  const isEditable =
    report.status === 'draft' || report.status === 'rejected' || isSuperEditor
  // Eliminar: el autor solo en borrador; admin/coordinadoras en cualquier estado.
  const canDelete = report.status === 'draft' || isSuperEditor

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (mode === 'file' && filePath && next === 'editor') {
      const confirmSwitch = confirm(
        'Cambiar a editor borrará el archivo subido. ¿Continuar?',
      )
      if (!confirmSwitch) return
    }
    setMode(next)
    setError(null)
    setSavedHint(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('reportId', report.id)
      formData.append('file', f)
      const res = await uploadSessionReportFile(formData)
      if (!res.ok) {
        setError(res.error)
      } else {
        setFilePath(res.data.file_url)
        setFileName(res.data.file_name)
        setSavedHint(true)
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleRemoveFile = () => {
    if (!confirm('Eliminar el archivo subido?')) return
    setError(null)
    startTransition(async () => {
      const res = await removeSessionReportFile(report.id)
      if (!res.ok) {
        setError(res.error)
      } else {
        setFilePath(null)
        setFileName(null)
      }
    })
  }

  const handleDownload = async () => {
    if (!filePath) return
    const res = await getReportFileSignedUrl(filePath)
    if (res.ok) window.open(res.data, '_blank')
    else setError(res.error)
  }

  const handleSaveDraft = () => {
    if (mode === 'file') {
      // En file mode no hay borrador que guardar — el archivo ya se subió.
      setSavedHint(true)
      return
    }
    setError(null)
    setSavedHint(false)
    startTransition(async () => {
      const res = await updateSessionReportDraft(report.id, {
        actividades,
        respuesta_del_nino: respuesta,
        tarea_para_casa: tarea,
        observaciones_internas: observaciones,
        visible_to_family: visibleToFamily,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSavedHint(true)
      onReportUpdated?.(res.report)
    })
  }

  const handleSubmit = () => {
    setError(null)
    if (mode === 'editor' && !actividades.trim()) {
      setError('Llená al menos el campo de actividades antes de enviar.')
      return
    }
    if (mode === 'file' && !filePath) {
      setError('Subí un archivo antes de enviar.')
      return
    }
    startTransition(async () => {
      // En editor mode, persistir cambios antes de submit.
      if (mode === 'editor') {
        const upd = await updateSessionReportDraft(report.id, {
          actividades,
          respuesta_del_nino: respuesta,
          tarea_para_casa: tarea,
          observaciones_internas: observaciones,
          visible_to_family: visibleToFamily,
        })
        if (!upd.ok) {
          setError(upd.error)
          return
        }
      }
      const sub = await submitSessionReport(report.id)
      if (!sub.ok) {
        setError(sub.error)
        return
      }
      onReportUpdated?.(sub.report)
      onOpenChange(false)
    })
  }

  const handleDelete = () => {
    if (!confirm('¿Eliminar este reporte de borrador? Esta acción no se puede deshacer.')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteSessionReport(report.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDeleted?.()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 shrink-0">
          <DialogTitle>Reporte de sesión — {childName}</DialogTitle>
          <DialogDescription>Estado: {STATUS_LABEL[report.status]}</DialogDescription>
        </DialogHeader>

        {/* Body scrollable — header y footer quedan fijos */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
        {report.status === 'rejected' && report.rejection_reason && (
          <div className="rounded-xl border border-fm-error/40 bg-fm-error/10 p-3 text-sm text-fm-error">
            <p className="font-semibold">Motivo del rechazo:</p>
            <p className="mt-1 whitespace-pre-wrap">{report.rejection_reason}</p>
            <p className="mt-2 text-xs">
              Corregí lo señalado y volvé a enviar a aprobación.
            </p>
          </div>
        )}

        {/* Toggle mode */}
        {isEditable && (
          <div className="inline-flex p-1 rounded-full bg-fm-surface-container-high text-xs font-semibold">
            <button
              type="button"
              onClick={() => switchMode('editor')}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                mode === 'editor'
                  ? 'bg-fm-primary text-white'
                  : 'text-fm-on-surface-variant hover:text-fm-on-surface'
              }`}
            >
              Escribir en la app
            </button>
            <button
              type="button"
              onClick={() => switchMode('file')}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                mode === 'file'
                  ? 'bg-fm-primary text-white'
                  : 'text-fm-on-surface-variant hover:text-fm-on-surface'
              }`}
            >
              Subir archivo
            </button>
          </div>
        )}

        {mode === 'editor' ? (
          <div className="space-y-3">
            <Field
              label="Actividades realizadas"
              value={actividades}
              onChange={setActividades}
              disabled={!isEditable || isPending}
              required
              placeholder="Qué se trabajó durante la sesión…"
            />
            <Field
              label="Respuesta del niño/a"
              value={respuesta}
              onChange={setRespuesta}
              disabled={!isEditable || isPending}
              placeholder="Cómo respondió, ánimo, participación…"
            />
            <Field
              label="Tarea para casa"
              value={tarea}
              onChange={setTarea}
              disabled={!isEditable || isPending}
              placeholder="Ejercicios o sugerencias para reforzar entre sesiones…"
            />
            <Field
              label="Observaciones internas"
              badge="Solo staff"
              value={observaciones}
              onChange={setObservaciones}
              disabled={!isEditable || isPending}
              placeholder="Notas que la familia NO debe ver."
            />

            <label className="flex items-center gap-2 text-sm text-fm-on-surface select-none cursor-pointer">
              <input
                type="checkbox"
                checked={visibleToFamily}
                onChange={(e) => setVisibleToFamily(e.target.checked)}
                disabled={!isEditable || isPending}
                className="rounded"
              />
              Visible para la familia (al aprobar se les envía)
            </label>
          </div>
        ) : (
          <FileUploader
            fileName={fileName}
            isUploading={isUploading}
            isEditable={isEditable && !isPending}
            onSelectFile={handleFileChange}
            onRemove={handleRemoveFile}
            onDownload={handleDownload}
          />
        )}

        {error && (
          <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">
            {error}
          </div>
        )}
        {savedHint && !error && (
          <div className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
            {mode === 'file' ? 'Archivo guardado.' : 'Borrador guardado.'}
          </div>
        )}

        {/* Adjuntos extra de la sesión (tareas, imágenes, etc.) — mig 0119 */}
        <div className="border-t border-fm-outline-variant/15 pt-3 pb-4">
          <ChildAttachmentManagerLazy
            childId={report.child_id}
            link={{ sessionReportId: report.id }}
            defaultKind="tarea"
            title="Adjuntos para la familia"
            allowedKinds={['tarea', 'imagen', 'evaluacion', 'otro']}
          />
        </div>
        </div>
        {/* Footer fijo */}
        <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-muted/30 p-4 shrink-0">
          {/* Eliminar: autor solo en borrador, admin/coordinadoras siempre */}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="px-3 py-2 rounded-xl text-sm font-medium text-fm-error hover:bg-fm-error/10 disabled:opacity-50 transition-colors"
            >
              Eliminar
            </button>
          )}
          <div className="ml-auto flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
            >
              Cerrar
            </button>
            {isEditable && (
              <>
                {mode === 'editor' && (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50 transition-colors"
                  >
                    {isPending
                      ? 'Guardando…'
                      : report.status === 'draft' || report.status === 'rejected'
                        ? 'Guardar borrador'
                        : 'Guardar cambios'}
                  </button>
                )}
                {/* Enviar a aprobación: solo cuando el reporte está en borrador/rechazado.
                    En otros estados (approved, sent_to_family) el super editor solo guarda
                    cambios sin volver a disparar el flujo de aprobación. */}
                {(report.status === 'draft' || report.status === 'rejected') && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending || isUploading}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Enviando…' : 'Enviar a aprobación'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  required?: boolean
  badge?: string
  placeholder?: string
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
  badge,
  placeholder,
}: FieldProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">
          {label} {required && <span className="text-fm-error">*</span>}
        </label>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-fm-on-surface-variant/10 text-fm-on-surface-variant">
            {badge}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 resize-none focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-60"
      />
    </div>
  )
}

interface FileUploaderProps {
  fileName: string | null
  isUploading: boolean
  isEditable: boolean
  onSelectFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
  onDownload: () => void
}

function FileUploader({
  fileName,
  isUploading,
  isEditable,
  onSelectFile,
  onRemove,
  onDownload,
}: FileUploaderProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-fm-on-surface-variant">
        PDF, Word, Excel o imagen (máx 10 MB). El archivo se sube de inmediato
        al seleccionarlo.
      </p>
      {fileName ? (
        <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span
              className="material-symbols-outlined text-fm-primary text-2xl"
              aria-hidden="true"
            >
              description
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fm-on-surface truncate">
                {fileName}
              </p>
              <p className="text-xs text-fm-on-surface-variant">
                Archivo subido y guardado.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDownload}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fm-primary/10 text-fm-primary hover:bg-fm-primary/20 transition-colors"
            >
              Descargar
            </button>
            {isEditable && (
              <>
                <label className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface cursor-pointer transition-colors">
                  Reemplazar
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp"
                    onChange={onSelectFile}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={isUploading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-fm-error hover:bg-fm-error/10 transition-colors"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      ) : isEditable ? (
        <label className="block rounded-2xl border-2 border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 p-8 text-center cursor-pointer hover:border-fm-primary/40 hover:bg-fm-primary/5 transition-colors">
          <span
            className="material-symbols-outlined text-fm-primary text-3xl block mb-2"
            aria-hidden="true"
          >
            upload_file
          </span>
          <p className="text-sm font-semibold text-fm-on-surface">
            {isUploading ? 'Subiendo…' : 'Seleccionar archivo'}
          </p>
          <p className="text-xs text-fm-on-surface-variant mt-1">
            PDF, .doc/.docx, .xls/.xlsx, .png/.jpg/.webp
          </p>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp"
            onChange={onSelectFile}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      ) : (
        <p className="text-sm text-fm-on-surface-variant italic">
          No hay archivo cargado.
        </p>
      )}
    </div>
  )
}
