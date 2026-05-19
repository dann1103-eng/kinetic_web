'use client'

import { useState, useTransition } from 'react'
import { getReportFileSignedUrl } from '@/app/actions/report-files'

interface Props {
  filePath: string
  fileName: string
  label?: string
}

/**
 * Botón que pide una signed URL del bucket reports-files al servidor y dispara
 * la descarga inmediatamente. Se usa en el portal de padres y en aprobaciones
 * para descargar PDFs / archivos de informes.
 */
export function ReportFileDownloadButton({ filePath, fileName, label = 'Descargar archivo' }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const res = await getReportFileSignedUrl(filePath)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Abrir en una pestaña nueva — el browser fuerza descarga según Content-Type
      window.open(res.data, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-kp-primary text-kp-on-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {pending ? 'progress_activity' : 'download'}
        </span>
        {pending ? 'Generando…' : label}
        {fileName && (
          <span className="text-[11px] font-normal opacity-80 max-w-[180px] truncate">
            · {fileName}
          </span>
        )}
      </button>
      {error && <p className="text-xs text-fm-error">{error}</p>}
    </div>
  )
}
