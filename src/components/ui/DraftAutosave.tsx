'use client'

/**
 * Piezas de UI para el autoguardado local de borradores (ver `useDraft`).
 *
 * - `DraftRestoreBanner`: aviso al abrir un formulario que tiene un borrador
 *   guardado en el dispositivo. Ofrece restaurar o descartar.
 * - `SaveStatusIndicator`: indicador chico de "guardado local" + estado de
 *   conexión, para dar confianza mientras escriben.
 */

function formatTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

interface DraftRestoreBannerProps {
  savedAt: number | null
  onRestore: () => void
  onDiscard: () => void
}

export function DraftRestoreBanner({ savedAt, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-amber-900">
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
        history
      </span>
      <span className="flex-1 min-w-[12rem]">
        Tenés cambios sin guardar en este dispositivo
        {savedAt ? ` (${formatTime(savedAt)})` : ''}. ¿Querés recuperarlos?
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors"
        >
          Restaurar
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}

interface SaveStatusIndicatorProps {
  savedAt: number | null
  online: boolean
  className?: string
}

export function SaveStatusIndicator({ savedAt, online, className }: SaveStatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${className ?? ''}`}>
      {!online && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>cloud_off</span>
          Sin conexión
        </span>
      )}
      {savedAt ? (
        <span className="inline-flex items-center gap-1 text-fm-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>save</span>
          Guardado local {formatTime(savedAt)}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Banner de envío fallido por falta de conexión: los datos están a salvo en el
 * dispositivo, solo hay que reintentar al volver internet.
 */
export function OfflineSaveError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-rose-800">
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>cloud_off</span>
      <span className="flex-1 min-w-[12rem]">
        No se pudo guardar (sin conexión). Tus cambios están guardados en este
        dispositivo — reintentá cuando vuelva el internet.
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
      >
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}
