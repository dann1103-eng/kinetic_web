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
   * Alta o retiro que dejó algo sin resolver. **Sin esto era invisible**: la
   * ficha no lista las bajas, y la única forma de ver si había una era abrir el
   * formulario — que CREA un borrador si no existe, así que revisar contaminaba
   * el dato (caso reportado el 31-ago-2026).
   *
   * **Firmar cierra la baja.** Enviarle el documento a la familia es opcional,
   * así que un registro firmado NO se avisa... salvo que el niño siga sin su
   * fase terminal: eso son las bajas firmadas ANTES de que el cambio de fase se
   * moviera a la firma, que quedaron a medias y hay que destrabar.
   */
  const [pending, setPending] = useState<ChildDischargeRecord | null>(null)
  const isTerminal =
    currentPhaseCode === '5_1_alta_terapeutica' || currentPhaseCode === '5_2_retirado'
  useEffect(() => {
    let cancelled = false
    listDischargeRecordsForChild(childId).then((recs) => {
      if (cancelled) return
      const unfinished = recs.find(
        (r) => r.status === 'draft' || (r.status === 'signed' && !isTerminal),
      )
      setPending(unfinished ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [childId, isTerminal])

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
                : 'Se firmó, pero el niño/a quedó sin su fase de cierre. Abrilo y volvé a completarlo.'}
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
