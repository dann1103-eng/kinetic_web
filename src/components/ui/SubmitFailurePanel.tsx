'use client'

import { useState } from 'react'
import type { SubmitFailureReport } from '@/lib/domain/submit-failure'

/**
 * Panel de "no se pudo guardar": dice qué pasó, qué hacer, y deja a la vista un
 * detalle técnico que se copia con un clic para mandarlo a quien da soporte.
 * Se arma con `reportFromServerFailure` / `reportFromThrown`
 * (`@/lib/domain/submit-failure`).
 *
 * No trae botón de reintentar a propósito: el botón de enviar del propio
 * formulario ya es el reintento, y cuando `outcomeUnknown` es true el texto
 * pide revisar antes de reenviar para no duplicar el registro.
 */
export function SubmitFailurePanel({ report }: { report: SubmitFailureReport }) {
  const [copy, setCopy] = useState<'ok' | 'fail' | null>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report.technical)
      setCopy('ok')
    } catch {
      // Sin permiso de portapapeles (o página sin https): el texto ya está a la
      // vista y se selecciona entero con un clic.
      setCopy('fail')
    }
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 space-y-2"
    >
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: '20px' }}>
          error
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold">
            {report.outcomeUnknown
              ? 'No pudimos confirmar que se guardó'
              : 'No se guardó la entrada'}
          </p>
          <p>{report.headline}</p>
          <p className="text-rose-800">{report.hint}</p>
        </div>
      </div>

      <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-white/70 px-2 py-1.5 font-mono text-[11px] text-rose-950 select-all">
        {report.technical}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors"
        >
          Copiar detalle del error
        </button>
        {copy === 'ok' && (
          <span className="text-xs font-medium text-rose-800">
            Copiado. Pegalo en el chat de soporte.
          </span>
        )}
        {copy === 'fail' && (
          <span className="text-xs font-medium text-rose-800">
            No se pudo copiar solo: hacé clic en el recuadro y copiá el texto (Ctrl+C).
          </span>
        )}
      </div>
    </div>
  )
}
