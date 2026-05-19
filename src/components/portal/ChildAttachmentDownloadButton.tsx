'use client'

import { useState, useTransition } from 'react'
import { getChildAttachmentSignedUrl } from '@/app/actions/child-attachments'

interface Props {
  attachmentId: string
  label?: string
  compact?: boolean
}

/**
 * Botón que pide una signed URL del adjunto y dispara la descarga en una
 * pestaña nueva. Usa el server action `getChildAttachmentSignedUrl` que
 * valida acceso vía RLS.
 */
export function ChildAttachmentDownloadButton({
  attachmentId,
  label = 'Descargar',
  compact = false,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const res = await getChildAttachmentSignedUrl(attachmentId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    })
  }

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="w-10 h-10 rounded-full bg-kp-primary text-kp-on-primary flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0"
          aria-label={pending ? 'Generando enlace…' : 'Descargar'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            {pending ? 'progress_activity' : 'download'}
          </span>
        </button>
        {error && <p className="text-[10px] text-fm-error max-w-[120px] text-right">{error}</p>}
      </div>
    )
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
      </button>
      {error && <p className="text-xs text-fm-error">{error}</p>}
    </div>
  )
}
