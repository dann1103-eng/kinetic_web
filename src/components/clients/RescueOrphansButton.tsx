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
        'Esto traerá los requerimientos reales (con su chat, revisión, tiempo y cambios) del ciclo anterior al actual y eliminará cualquier copia vacía que haya quedado de un rescate previo. ¿Continuar?'
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
      const totalActions =
        r.moved + r.duplicatesReplaced + r.duplicatesDeleted + r.duplicatesMerged
      if (totalActions === 0 && r.duplicatesKept === 0) {
        const d = r.diagnostics
        const lines = [
          'Nada que hacer.',
          `Ciclos archivados: ${d.archivedCyclesCount}`,
          `Reqs en ciclos archivados: ${d.archivedReqsTotal}`,
          `  · anulados: ${d.archivedReqsBreakdown.voided}`,
          `  · publicados/entregados: ${d.archivedReqsBreakdown.publicado_entregado}`,
          `  · tipos no-pipeline: ${d.archivedReqsBreakdown.not_pipeline_type}`,
          `  · abiertos elegibles: ${d.archivedReqsBreakdown.open_pipeline}`,
          `Reqs carried_over en el ciclo actual: ${d.currentCycleCarriedOver}`,
        ]
        setMsg({ type: 'success', text: lines.join(' · ') })
      } else {
        const parts: string[] = []
        if (r.moved > 0) parts.push(`${r.moved} movido${r.moved === 1 ? '' : 's'}`)
        if (r.duplicatesReplaced > 0) parts.push(`${r.duplicatesReplaced} duplicado${r.duplicatesReplaced === 1 ? '' : 's'} reemplazado${r.duplicatesReplaced === 1 ? '' : 's'}`)
        if (r.duplicatesMerged > 0) parts.push(`${r.duplicatesMerged} duplicado${r.duplicatesMerged === 1 ? '' : 's'} fusionado${r.duplicatesMerged === 1 ? '' : 's'} (datos preservados)`)
        if (r.duplicatesDeleted > 0) parts.push(`${r.duplicatesDeleted} duplicado${r.duplicatesDeleted === 1 ? '' : 's'} vacío${r.duplicatesDeleted === 1 ? '' : 's'} borrado${r.duplicatesDeleted === 1 ? '' : 's'}`)
        if (r.duplicatesKept > 0) parts.push(`${r.duplicatesKept} duplicado${r.duplicatesKept === 1 ? '' : 's'} conservado${r.duplicatesKept === 1 ? '' : 's'} (con datos, sin original)`)
        setMsg({ type: 'success', text: parts.join(' · ') })
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
          className={`text-xs whitespace-pre-line max-w-md text-right ${
            msg.type === 'success' ? 'text-fm-primary' : 'text-fm-error'
          }`}
        >
          {msg.text.replace(/ · /g, '\n')}
        </p>
      )}
    </div>
  )
}
