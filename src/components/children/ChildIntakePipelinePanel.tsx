'use client'

import { useEffect, useState } from 'react'
import { ChildIntakePipelineWidget } from './ChildIntakePipelineWidget'
import { ChildPhaseTimeline } from './ChildPhaseTimeline'
import { DischargeFormModal } from '@/components/discharge/DischargeFormModal'
import { listDischargeRecordsForChild } from '@/app/actions/discharge-records'
import { DISCHARGE_TYPE_LABELS } from '@/types/db'
import type { ChildDischargeRecord, DischargeType, IntakePhaseCatalogEntry } from '@/types/db'
import { formatDateEs } from '@/lib/domain/dates'

interface Props {
  childId: string
  childName: string
  currentPhaseCode: string | null
  phaseCatalog: IntakePhaseCatalogEntry[]
  authorNamesById?: Record<string, string>
}

/**
 * Wrapper cliente que coordina:
 *   - Widget de pipeline (stepper + cambio de fase)
 *   - Timeline (drawer expandible)
 *   - Modal de alta/retiro (cuando la fase destino es terminal)
 */
export function ChildIntakePipelinePanel({
  childId,
  childName,
  currentPhaseCode,
  phaseCatalog,
  authorNamesById,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dischargeType, setDischargeType] = useState<DischargeType | null>(null)

  /**
   * Alta o retiro empezado y sin terminar. **Sin esto era invisible**: la ficha
   * no lista las bajas, y la única forma de ver si hay una era abrir el
   * formulario — que CREA un borrador si no existe, así que revisar contaminaba
   * el dato. Una baja a medio hacer deja al niño activo para todo el equipo y
   * nadie tenía cómo enterarse (caso reportado el 31-ago-2026).
   */
  const [pending, setPending] = useState<ChildDischargeRecord | null>(null)
  useEffect(() => {
    let cancelled = false
    listDischargeRecordsForChild(childId).then((recs) => {
      if (cancelled) return
      setPending(recs.find((r) => r.status !== 'sent_to_family') ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [childId])

  return (
    <div className="space-y-3">
      {pending && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {DISCHARGE_TYPE_LABELS[pending.discharge_type]} sin terminar
              {pending.discharge_date ? ` · ${formatDateEs(pending.discharge_date)}` : ''}
            </p>
            <p className="text-[12px] text-amber-800 mt-0.5">
              {pending.status === 'draft'
                ? 'Quedó en borrador, sin firmar. El niño/a sigue apareciendo activo para todo el equipo hasta que se firme.'
                : 'Está firmado pero no se envió a la familia. Abrilo y enviálo para completarlo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDischargeType(pending.discharge_type)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:opacity-90"
          >
            Abrir
          </button>
        </div>
      )}
      <ChildIntakePipelineWidget
        childId={childId}
        childName={childName}
        currentPhaseCode={currentPhaseCode}
        phaseCatalog={phaseCatalog}
        onRequestDischarge={(type) => setDischargeType(type)}
        onOpenHistory={() => setHistoryOpen((v) => !v)}
      />

      {historyOpen && (
        <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
              Historial de fases
            </p>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="text-xs text-fm-on-surface-variant hover:underline"
            >
              Ocultar
            </button>
          </div>
          <ChildPhaseTimeline
            childId={childId}
            phaseCatalog={phaseCatalog}
            authorNamesById={authorNamesById}
          />
        </div>
      )}

      {dischargeType && (
        <DischargeFormModal
          childId={childId}
          childName={childName}
          dischargeType={dischargeType}
          onClose={() => setDischargeType(null)}
        />
      )}
    </div>
  )
}
