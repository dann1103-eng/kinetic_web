'use client'

import { useState } from 'react'
import { getReportFileSignedUrl } from '@/app/actions/report-files'

interface Props {
  path: string
  label?: string
  className?: string
}

/**
 * Botón que abre un archivo del bucket privado reports-files generando una
 * signed URL on-demand. Se usa en historias y previews de reportes.
 */
export function ReportFileDownloadButton({
  path,
  label = 'Descargar',
  className,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await getReportFileSignedUrl(path)
      if (res.ok) {
        window.open(res.data, '_blank', 'noopener,noreferrer')
      } else {
        setError(res.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-fm-primary/10 text-fm-primary hover:bg-fm-primary/20 disabled:opacity-50 transition-colors'
        }
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          download
        </span>
        {loading ? 'Cargando…' : label}
      </button>
      {error && <span className="text-[11px] text-fm-error">{error}</span>}
    </div>
  )
}
