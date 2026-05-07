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
} from '@/app/actions/session-reports'
import type { SessionReport } from '@/types/db'

interface SessionReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: SessionReport
  childName: string
  /** Llamado cuando el reporte se actualiza (parent puede refrescar su state). */
  onReportUpdated?: (report: SessionReport) => void
}

const STATUS_LABEL: Record<SessionReport['status'], string> = {
  draft: 'Borrador',
  submitted: 'Enviado, esperando aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent_to_family: 'Enviado a la familia',
}

export function SessionReportModal({
  open,
  onOpenChange,
  report,
  childName,
  onReportUpdated,
}: SessionReportModalProps) {
  const [actividades, setActividades] = useState(report.actividades)
  const [respuesta, setRespuesta] = useState(report.respuesta_del_nino)
  const [tarea, setTarea] = useState(report.tarea_para_casa)
  const [observaciones, setObservaciones] = useState(report.observaciones_internas)
  const [visibleToFamily, setVisibleToFamily] = useState(report.visible_to_family)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState(false)

  const isEditable = report.status === 'draft' || report.status === 'rejected'

  const handleSaveDraft = () => {
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
    if (!actividades.trim()) {
      setError('Llená al menos el campo de actividades antes de enviar.')
      return
    }
    startTransition(async () => {
      // Guardar primero para asegurar que el contenido editado se persistió.
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
      const sub = await submitSessionReport(report.id)
      if (!sub.ok) {
        setError(sub.error)
        return
      }
      onReportUpdated?.(sub.report)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reporte de sesión — {childName}</DialogTitle>
          <DialogDescription>
            Estado: {STATUS_LABEL[report.status]}
          </DialogDescription>
        </DialogHeader>

        {report.status === 'rejected' && report.rejection_reason && (
          <div className="rounded-xl border border-fm-error/40 bg-fm-error/10 p-3 text-sm text-fm-error">
            <p className="font-semibold">Motivo del rechazo:</p>
            <p className="mt-1 whitespace-pre-wrap">{report.rejection_reason}</p>
            <p className="mt-2 text-xs">Corregí lo señalado y volvé a enviar a aprobación.</p>
          </div>
        )}

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

        {error && (
          <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">{error}</div>
        )}
        {savedHint && !error && (
          <div className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
            Borrador guardado.
          </div>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/30 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
          >
            Cerrar
          </button>
          {isEditable && (
            <>
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
            </>
          )}
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

function Field({ label, value, onChange, disabled, required, badge, placeholder }: FieldProps) {
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
