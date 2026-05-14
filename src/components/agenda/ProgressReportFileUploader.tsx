'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  uploadProgressReportFile,
  removeProgressReportFile,
  getReportFileSignedUrl,
} from '@/app/actions/report-files'
import {
  submitProgressReport,
  approveProgressReport,
  rejectProgressReport,
  deleteProgressReport,
} from '@/app/actions/progress-reports'
import type { ProgressReport, ProgressReportStatus } from '@/types/db'

interface Props {
  report: ProgressReport
  childName: string
  serviceLabel: string
  authorName: string
  /** Si true, el usuario actual puede aprobar/rechazar (admin o directora). */
  canApprove: boolean
  /** Si true, el usuario es el autor (terapista). */
  isAuthor: boolean
  /** href para volver al perfil del niño */
  backHref: string
}

const STATUS_LABELS: Record<ProgressReportStatus, string> = {
  draft: 'Borrador',
  submitted: 'Esperando aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent_to_family: 'Enviado a la familia',
}

const STATUS_TONES: Record<ProgressReportStatus, string> = {
  draft: 'bg-fm-surface-container text-fm-on-surface-variant',
  submitted: 'bg-blue-100 text-blue-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  sent_to_family: 'bg-emerald-100 text-emerald-900',
}

export function ProgressReportFileUploader({
  report: initialReport,
  childName,
  serviceLabel,
  authorName,
  canApprove,
  isAuthor,
  backHref,
}: Props) {
  const router = useRouter()
  const [report, setReport] = useState(initialReport)
  const [filePath, setFilePath] = useState<string | null>(initialReport.file_url)
  const [fileName, setFileName] = useState<string | null>(initialReport.file_name)
  const [isUploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const isEditable =
    isAuthor && (report.status === 'draft' || report.status === 'rejected')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setOkMsg(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('reportId', report.id)
      formData.append('file', f)
      const res = await uploadProgressReportFile(formData)
      if (!res.ok) {
        setError(res.error)
      } else {
        setFilePath(res.data.file_url)
        setFileName(res.data.file_name)
        setOkMsg('Archivo guardado.')
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleRemove = () => {
    if (!confirm('Eliminar el archivo subido?')) return
    setError(null)
    startTransition(async () => {
      const res = await removeProgressReportFile(report.id)
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

  const handleSubmit = () => {
    setError(null)
    if (!filePath) {
      setError('Subí el archivo antes de enviar a aprobación.')
      return
    }
    startTransition(async () => {
      const res = await submitProgressReport(report.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setReport(res.report)
      setOkMsg('Enviado a aprobación.')
      router.refresh()
    })
  }

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      const res = await approveProgressReport(report.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setReport(res.report)
      setOkMsg('Informe aprobado.')
      router.refresh()
    })
  }

  const handleReject = () => {
    setError(null)
    if (rejectReason.trim().length < 10) {
      setError('El motivo debe tener al menos 10 caracteres.')
      return
    }
    startTransition(async () => {
      const res = await rejectProgressReport(report.id, rejectReason.trim())
      if (!res.ok) {
        setError(res.error)
        return
      }
      setReport(res.report)
      setShowReject(false)
      setRejectReason('')
      setOkMsg('Informe rechazado.')
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!confirm('¿Eliminar este informe de borrador? Esta acción no se puede deshacer.')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteProgressReport(report.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(backHref)
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Informe cuatrimestral
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
          {serviceLabel} — {childName}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-fm-on-surface-variant">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_TONES[report.status]}`}
          >
            {STATUS_LABELS[report.status]}
          </span>
          <span>
            Autor: <span className="font-medium text-fm-on-surface">{authorName}</span>
          </span>
          <span>
            Período: {report.period_starts} – {report.period_ends}
          </span>
        </div>
      </header>

      {report.status === 'rejected' && report.rejection_reason && (
        <div className="rounded-2xl border border-fm-error/40 bg-fm-error/10 p-4 text-sm text-fm-error">
          <p className="font-semibold">Motivo del rechazo:</p>
          <p className="mt-1 whitespace-pre-wrap">{report.rejection_reason}</p>
          <p className="mt-2 text-xs">
            Subí el archivo corregido y volvé a enviar a aprobación.
          </p>
        </div>
      )}

      {/* File upload zone */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant">
          Archivo del informe
        </h2>
        <p className="text-xs text-fm-on-surface-variant">
          PDF, Word (.doc/.docx), Excel (.xls/.xlsx) o imagen (PNG/JPG/WebP).
          Máximo 10 MB.
        </p>

        {fileName ? (
          <div className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-6 space-y-4">
            <div className="flex items-start gap-4">
              <span
                className="material-symbols-outlined text-fm-primary text-4xl"
                aria-hidden="true"
              >
                description
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-fm-on-surface truncate">
                  {fileName}
                </p>
                {report.file_size_bytes && (
                  <p className="text-xs text-fm-on-surface-variant">
                    {(report.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-primary/10 text-fm-primary hover:bg-fm-primary/20 transition-colors"
              >
                Descargar
              </button>
              {isEditable && (
                <>
                  <label className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface cursor-pointer transition-colors">
                    Reemplazar
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={isUploading || isPending}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-fm-error hover:bg-fm-error/10 transition-colors"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        ) : isEditable ? (
          <label className="block rounded-3xl border-2 border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 p-12 text-center cursor-pointer hover:border-fm-primary/40 hover:bg-fm-primary/5 transition-colors">
            <span
              className="material-symbols-outlined text-fm-primary text-5xl block mb-3"
              aria-hidden="true"
            >
              upload_file
            </span>
            <p className="text-base font-semibold text-fm-on-surface">
              {isUploading ? 'Subiendo…' : 'Seleccionar archivo'}
            </p>
            <p className="text-xs text-fm-on-surface-variant mt-2">
              o arrastrá el archivo aquí (PDF, Word, Excel o imagen)
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        ) : (
          <div className="rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-low/30 p-8 text-center">
            <p className="text-sm text-fm-on-surface-variant italic">
              Aún no hay archivo cargado.
            </p>
          </div>
        )}
      </section>

      {/* Mensajes */}
      {error && (
        <div className="rounded-xl border border-fm-error/30 bg-fm-error/10 px-4 py-3 text-sm text-fm-error">
          {error}
        </div>
      )}
      {okMsg && !error && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {okMsg}
        </div>
      )}

      {/* Acciones de workflow */}
      <section className="flex flex-wrap items-center gap-3 pt-4 border-t border-fm-outline-variant/20">
        <Link
          href={backHref}
          className="text-sm font-semibold text-fm-on-surface-variant hover:text-fm-on-surface underline-offset-2 hover:underline"
        >
          ← Volver al expediente
        </Link>
        {/* Eliminar — solo disponible en borrador */}
        {isAuthor && report.status === 'draft' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending || isUploading}
            className="text-sm font-semibold text-fm-error hover:underline underline-offset-2 disabled:opacity-50"
          >
            Eliminar informe
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {isAuthor && report.status === 'draft' && filePath && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Enviando…' : 'Enviar a aprobación'}
            </button>
          )}
          {isAuthor && report.status === 'rejected' && filePath && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
            >
              Volver a enviar
            </button>
          )}
          {canApprove && report.status === 'submitted' && (
            <>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-fm-error/40 text-fm-error hover:bg-fm-error/10 disabled:opacity-50 transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Aprobando…' : 'Aprobar'}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Modal de rechazo */}
      {showReject && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">
              Rechazar informe
            </h3>
            <p className="text-xs text-fm-on-surface-variant">
              Explicá qué hay que corregir. El motivo se enviará a la terapista
              autora.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Motivo del rechazo…"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white dark:bg-fm-surface-container px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReject(false)
                  setRejectReason('')
                }}
                className="px-3 py-1.5 text-sm rounded-lg hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-error text-white font-medium hover:bg-fm-error/90 disabled:opacity-60"
              >
                {isPending ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
