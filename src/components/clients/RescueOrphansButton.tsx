'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { rescueOrphanedRequirements } from '@/app/actions/renewals'

interface Props {
  clientId: string
}

/**
 * Botón admin/supervisor: rescata requerimientos huérfanos en ciclos archivados
 * (que se quedaron en proceso al renovar y no fueron trasladados al nuevo ciclo
 * por el cron) y los copia al ciclo current con `carried_over=true`.
 *
 * Idempotente: si ya hay un traslado con el mismo title+content_type, se omite.
 */
export function RescueOrphansButton({ clientId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleClick() {
    if (
      !confirm(
        'Esto buscará requerimientos en proceso del ciclo anterior que no se trasladaron al nuevo ciclo y los traerá. ¿Continuar?'
      )
    ) {
      return
    }
    setMsg(null)
    startTransition(async () => {
      const r = await rescueOrphanedRequirements(clientId)
      if ('error' in r) {
        setMsg({ type: 'error', text: r.error })
        return
      }
      if (r.rescued === 0) {
        setMsg({ type: 'success', text: 'No hay requerimientos huérfanos por rescatar.' })
      } else {
        setMsg({
          type: 'success',
          text: `Se rescataron ${r.rescued} requerimiento${r.rescued === 1 ? '' : 's'}.`,
        })
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-xl text-xs font-semibold border-fm-outline-variant"
      >
        <span className="material-symbols-outlined text-sm mr-1">restore</span>
        {isPending ? 'Rescatando…' : 'Rescatar requerimientos del ciclo anterior'}
      </Button>
      {msg && (
        <p
          className={`text-xs ${
            msg.type === 'success' ? 'text-fm-primary' : 'text-fm-error'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
