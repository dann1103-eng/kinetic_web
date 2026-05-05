'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error boundary]', error)
  }, [error])

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center bg-fm-background">
      <p className="text-sm font-semibold text-fm-on-surface">Error al cargar la página</p>
      <p className="text-xs text-fm-on-surface-variant max-w-sm break-all">
        {error.message || 'Error desconocido'}
        {error.digest && <span className="block mt-1 opacity-50">digest: {error.digest}</span>}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-fm-primary text-white text-sm font-semibold"
      >
        Reintentar
      </button>
    </div>
  )
}
