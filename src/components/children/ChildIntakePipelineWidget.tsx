'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  advanceChildPhase,
  getFutureAppointmentsCount,
} from '@/app/actions/intake-pipeline'
import { groupPhaseCatalog } from '@/lib/domain/intake-pipeline'
import {
  PHASE_GROUP_COLORS,
  PHASE_GROUP_LABELS,
  type IntakePhaseCatalogEntry,
  type PhaseGroupNumber,
} from '@/types/db'
import { PhaseChip } from '@/components/pipeline/PhaseChip'
import { PhaseAdvanceMenu } from '@/components/pipeline/PhaseAdvanceMenu'

interface Props {
  childId: string
  childName: string
  currentPhaseCode: string | null
  phaseCatalog: IntakePhaseCatalogEntry[]
  /** Si la fase destino es 5.1 / 5.2, el caller intercepta para abrir el modal de alta. */
  onRequestDischarge?: (type: 'alta' | 'retiro') => void
  onOpenHistory?: () => void
}

/**
 * Stepper visual del pipeline. Muestra los 5 grupos en una tira horizontal
 * con la fase actual destacada. Permite avanzar via el dropdown PhaseAdvanceMenu,
 * con confirmación contextual cuando la fase destino cancela citas o es terminal.
 */
export function ChildIntakePipelineWidget({
  childId,
  childName,
  currentPhaseCode,
  phaseCatalog,
  onRequestDischarge,
  onOpenHistory,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<IntakePhaseCatalogEntry | null>(null)
  const [confirmNotes, setConfirmNotes] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [futureAppts, setFutureAppts] = useState<number | null>(null)

  const groups = groupPhaseCatalog(phaseCatalog)
  const currentPhase = currentPhaseCode
    ? phaseCatalog.find((p) => p.code === currentPhaseCode) ?? null
    : null

  useEffect(() => {
    if (!confirmTarget) {
      setFutureAppts(null)
      return
    }
    if (!confirmTarget.cancels_future_appointments) {
      setFutureAppts(0)
      return
    }
    let cancelled = false
    void getFutureAppointmentsCount(childId).then((n) => {
      if (!cancelled) setFutureAppts(n)
    })
    return () => {
      cancelled = true
    }
  }, [confirmTarget, childId])

  function handleSelectPhase(toCode: string) {
    setError(null)
    const target = phaseCatalog.find((p) => p.code === toCode)
    if (!target) return

    // Para fases terminales, delegar al modal de alta/retiro si el padre lo provee.
    if (target.is_terminal && onRequestDischarge) {
      onRequestDischarge(target.code === '5_1_alta_terapeutica' ? 'alta' : 'retiro')
      return
    }

    setConfirmTarget(target)
    setConfirmNotes('')
    setConfirmCancel(false)
  }

  function handleConfirm() {
    if (!confirmTarget) return
    if (confirmTarget.cancels_future_appointments && (futureAppts ?? 0) > 0 && !confirmCancel) {
      setError('Marcá la confirmación para cancelar las citas futuras.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await advanceChildPhase(
        childId,
        confirmTarget.code,
        confirmNotes.trim() || null,
        { confirmCancelAppointments: confirmCancel },
      )
      if (!res.ok) {
        setError(res.error)
        return
      }
      setConfirmTarget(null)
      setConfirmNotes('')
      setConfirmCancel(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
            Pipeline de admisión
          </p>
          <div className="flex items-center gap-2">
            <PhaseChip phase={currentPhase} size="md" />
            {currentPhase?.description && (
              <span className="text-xs text-fm-on-surface-variant max-w-md">
                {currentPhase.description}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PhaseAdvanceMenu
            catalog={phaseCatalog}
            currentCode={currentPhaseCode}
            disabled={isPending}
            onAdvance={handleSelectPhase}
            label="Cambiar fase…"
          />
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-xs text-fm-on-surface-variant hover:underline"
            >
              Ver historial
            </button>
          )}
        </div>
      </div>

      {/* Stepper horizontal por grupo */}
      <div className="flex items-stretch gap-2 overflow-x-auto pt-2">
        {groups.map((g) => {
          const palette = PHASE_GROUP_COLORS[g.group_number as PhaseGroupNumber]
          const hasCurrent = g.phases.some((p) => p.code === currentPhaseCode)
          const allPast =
            currentPhase != null &&
            g.phases.every((p) => p.sort_order < currentPhase.sort_order)
          return (
            <div
              key={g.group_number}
              className={`flex-1 min-w-[140px] rounded-xl border p-2 ${
                hasCurrent
                  ? `${palette.bg} ring-2 ${palette.ring}`
                  : allPast
                  ? 'bg-fm-surface-container border-fm-outline-variant/20 opacity-70'
                  : 'bg-fm-surface-container-low/50 border-fm-outline-variant/20'
              }`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  hasCurrent ? palette.text : 'text-fm-on-surface-variant'
                }`}
              >
                {g.group_number}. {PHASE_GROUP_LABELS[g.group_number as PhaseGroupNumber]}
              </p>
              <ul className="mt-1 space-y-0.5">
                {g.phases.map((p) => {
                  const isCurrent = p.code === currentPhaseCode
                  const isPast =
                    currentPhase != null && p.sort_order < currentPhase.sort_order
                  return (
                    <li
                      key={p.code}
                      className={`text-[11px] flex items-center gap-1 ${
                        isCurrent
                          ? 'font-bold text-fm-on-surface'
                          : isPast
                          ? 'text-fm-on-surface-variant line-through'
                          : 'text-fm-on-surface-variant'
                      }`}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '14px' }}
                      >
                        {isCurrent ? 'radio_button_checked' : isPast ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {p.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Modal de confirmación de transición */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-base font-semibold text-fm-on-surface">
              Cambiar fase de {childName}
            </h3>
            <p className="text-sm text-fm-on-surface-variant">
              Nueva fase: <strong>{confirmTarget.label}</strong>
            </p>
            {confirmTarget.description && (
              <p className="text-xs text-fm-on-surface-variant italic">
                {confirmTarget.description}
              </p>
            )}

            {confirmTarget.cancels_future_appointments && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-xs text-amber-900">
                  Esta fase implica cancelar citas futuras programadas.{' '}
                  {futureAppts === null ? (
                    <span className="italic">Verificando…</span>
                  ) : futureAppts > 0 ? (
                    <strong>{futureAppts} citas futuras se cancelarán.</strong>
                  ) : (
                    'No hay citas futuras a cancelar.'
                  )}
                </p>
                {(futureAppts ?? 0) > 0 && (
                  <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmCancel}
                      onChange={(e) => setConfirmCancel(e.target.checked)}
                    />
                    Confirmo que se cancelen las {futureAppts} citas futuras.
                  </label>
                )}
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant block mb-1">
                Nota (opcional)
              </label>
              <textarea
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                rows={3}
                placeholder="Ej: la familia pidió pausa por viaje familiar."
                className="w-full rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setConfirmTarget(null)
                  setConfirmNotes('')
                  setConfirmCancel(false)
                }}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:bg-fm-primary/90 disabled:opacity-60"
              >
                {isPending ? 'Aplicando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
