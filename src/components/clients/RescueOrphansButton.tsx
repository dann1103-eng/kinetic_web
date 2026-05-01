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
        'Esto traerá los requerimientos reales (con su chat, revisión, tiempo y cambios) del ciclo anterior al actual. Si en un rescate previo se crearon copias vacías, las reemplazará por los originales. ¿Continuar?'
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
      const total = r.moved + r.replaced
      if (total === 0 && r.skipped === 0) {
        setMsg({ type: 'success', text: 'No hay requerimientos huérfanos por rescatar.' })
      } else {
        const parts: string[] = []
        if (r.moved > 0) parts.push(`${r.moved} movido${r.moved === 1 ? '' : 's'}`)
        if (r.replaced > 0) parts.push(`${r.replaced} reemplazado${r.replaced === 1 ? '' : 's'}`)
        if (r.skipped > 0) parts.push(`${r.skipped} omitido${r.skipped === 1 ? '' : 's'} (con datos)`)
        setMsg({ type: 'success', text: parts.join(', ') + '.' })
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
