'use client'

import { useState } from 'react'

interface Props {
  /** URL del endpoint que genera el PDF. */
  href: string
  /** Nombre del archivo descargado (sin extensión). */
  filename: string
  label?: string
}

/**
 * Botón para descargar PDF de un reporte. Hace fetch del endpoint, recibe
 * el blob y dispara la descarga con el filename indicado.
 *
 * Pattern: similar a CsvDownloadButton, pero como blob binario.
 */
export function ReportDownloadButton({ href, filename, label = 'Descargar PDF' }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(href)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-fm-error">{error}</span>
      )}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {loading ? 'progress_activity' : 'download'}
        </span>
        {loading ? 'Generando…' : label}
      </button>
    </div>
  )
}
