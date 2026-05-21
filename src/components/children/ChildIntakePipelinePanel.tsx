'use client'

import { useState } from 'react'
import { ChildIntakePipelineWidget } from './ChildIntakePipelineWidget'
import { ChildPhaseTimeline } from './ChildPhaseTimeline'
import { DischargeFormModal } from '@/components/discharge/DischargeFormModal'
import type { DischargeType, IntakePhaseCatalogEntry } from '@/types/db'

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

  return (
    <div className="space-y-3">
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
          phaseCatalog={phaseCatalog}
          onClose={() => setDischargeType(null)}
        />
      )}
    </div>
  )
}
