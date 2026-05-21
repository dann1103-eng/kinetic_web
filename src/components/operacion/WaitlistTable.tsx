'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PHASE_GROUP_COLORS,
  PHASE_GROUP_LABELS,
  REFERRAL_CHANNEL_LABELS,
  SERVICE_TYPE_LABELS,
  type IntakePhaseCatalogEntry,
  type PhaseGroupNumber,
  type WaitlistEntry,
} from '@/types/db'
import { groupPhaseCatalog } from '@/lib/domain/intake-pipeline'
import { daysSinceAdded } from '@/lib/domain/waitlist-alerts'
import { advanceWaitlistPhase } from '@/app/actions/intake-pipeline'
import { TransformWaitlistModal } from './TransformWaitlistModal'
import { PhaseChip } from '@/components/pipeline/PhaseChip'

interface Props {
  entries: WaitlistEntry[]
  therapistsById: Record<string, string>
  /** Mapa de child_id → family_id, para link directo a ficha desde entradas ya inscritas. */
  familyIdByChildId?: Record<string, string>
  /** Catálogo de sub-fases para el modal de avance. */
  phaseCatalog: IntakePhaseCatalogEntry[]
}

const PRIORITY_TONE: Record<number, { label: string; bg: string; text: string }> = {
  0: { label: 'Normal', bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' },
  1: { label: 'Alta', bg: 'bg-amber-100', text: 'text-amber-900' },
  2: { label: 'Urgente', bg: 'bg-rose-100', text: 'text-rose-900' },
}

function calcAge(birthdate: string | null): string {
  if (!birthdate) return '—'
  const [y, m, d] = birthdate.split('-').map(Number)
  const dob = new Date(y, m - 1, d)
  const now = new Date()
  let years = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) years--
  if (years < 1) {
    const months = (now.getFullYear() - dob.getFullYear()) * 12 + monthDiff
    return `${months}m`
  }
  return `${years}a`
}

export function WaitlistTable({
  entries,
  therapistsById,
  familyIdByChildId,
  phaseCatalog,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<WaitlistEntry | null>(null)
  const [dropReason, setDropReason] = useState('')
  const [transformTarget, setTransformTarget] = useState<WaitlistEntry | null>(null)
  const [phaseTarget, setPhaseTarget] = useState<WaitlistEntry | null>(null)

  const catalogByCode: Record<string, IntakePhaseCatalogEntry> = {}
  for (const p of phaseCatalog) catalogByCode[p.code] = p

  function handleAdvanceTo(entryId: string, toCode: string) {
    setError(null)
    startTransition(async () => {
      const res = await advanceWaitlistPhase(entryId, toCode)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleReopen(entryId: string) {
    handleAdvanceTo(entryId, '1_1_contacto_inicial')
  }

  function confirmDrop() {
    if (!dropTarget) return
    if (dropReason.trim().length < 3) {
      setError('El motivo del descarte debe tener al menos 3 caracteres.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await advanceWaitlistPhase(dropTarget.id, '5_2_retirado', dropReason.trim())
      if (!res.ok) {
        setError(res.error)
      } else {
        setDropTarget(null)
        setDropReason('')
        router.refresh()
      }
    })
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
        <p className="text-sm text-fm-on-surface-variant">
          No hay entradas en la lista de espera con estos filtros.
        </p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800 mb-3">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fm-outline-variant/20 bg-fm-surface-container-low/50 text-left">
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Niño</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Contacto</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Terapia</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Preferencias</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Sub-fase</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant text-right">Espera</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const priority = PRIORITY_TONE[e.priority] ?? PRIORITY_TONE[0]
              const phase = e.current_phase_code ? catalogByCode[e.current_phase_code] : null
              const days = daysSinceAdded(e.added_at)
              const preferredTherapist = e.preferred_therapist_id
                ? therapistsById[e.preferred_therapist_id]
                : null
              const isTerminal = phase?.is_terminal ?? false
              const isInscribed = !!e.scheduled_child_id
              const familyId = e.scheduled_child_id ? familyIdByChildId?.[e.scheduled_child_id] : undefined

              return (
                <tr
                  key={e.id}
                  className="border-b border-fm-outline-variant/10 last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-fm-on-surface">{e.child_full_name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-fm-on-surface-variant tabular-nums">
                        {e.child_age_text ?? calcAge(e.child_birthdate)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${priority.bg} ${priority.text}`}
                      >
                        {priority.label}
                      </span>
                      {e.has_previous_evaluation && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-900">
                          Eval. previa
                        </span>
                      )}
                    </div>
                    {e.child_diagnosis && (
                      <p className="text-xs text-fm-on-surface-variant mt-1 italic line-clamp-2 max-w-[180px]">
                        {e.child_diagnosis}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-fm-on-surface">{e.parent_full_name}</p>
                    <a
                      href={`tel:${e.parent_phone}`}
                      className="text-xs text-fm-primary hover:underline block"
                    >
                      {e.parent_phone}
                    </a>
                    {e.parent_email && (
                      <a
                        href={`mailto:${e.parent_email}`}
                        className="text-xs text-fm-on-surface-variant hover:underline truncate max-w-[160px] block"
                      >
                        {e.parent_email}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-fm-on-surface">
                    {SERVICE_TYPE_LABELS[e.requested_service_type] ?? e.requested_service_type}
                  </td>
                  <td className="px-4 py-3 text-xs text-fm-on-surface-variant">
                    {e.referral_channel && (
                      <p>
                        <span className="font-semibold">Conoció por:</span>{' '}
                        {REFERRAL_CHANNEL_LABELS[e.referral_channel]}
                        {e.referral_channel_other && ` (${e.referral_channel_other})`}
                      </p>
                    )}
                    {e.interest_text && (
                      <p>
                        <span className="font-semibold">Interés:</span>{' '}
                        <span className="italic">{e.interest_text}</span>
                      </p>
                    )}
                    {preferredTherapist && (
                      <p>
                        <span className="font-semibold">Terapista:</span> {preferredTherapist}
                      </p>
                    )}
                    {e.preferred_days && (
                      <p>
                        <span className="font-semibold">Días:</span> {e.preferred_days}
                      </p>
                    )}
                    {!preferredTherapist && !e.preferred_days && !e.referral_channel && !e.interest_text && '—'}
                    {e.notes && (
                      <p className="italic mt-1 line-clamp-2 max-w-[200px]">{e.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PhaseChip phase={phase} fallback="(sin fase)" />
                    {phase?.code === '5_2_retirado' && e.dropped_reason && (
                      <p className="text-[11px] text-fm-on-surface-variant italic mt-1 max-w-[160px]">
                        {e.dropped_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-fm-on-surface-variant">
                    {days === 0 ? 'Hoy' : `${days}d`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col gap-1 items-end">
                      {isInscribed && familyId && (
                        <Link
                          href={`/familias/${familyId}/children/${e.scheduled_child_id}`}
                          className="text-xs font-semibold text-fm-primary hover:underline"
                        >
                          Ver ficha
                        </Link>
                      )}

                      {!isTerminal && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setPhaseTarget(e)}
                          className="text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
                        >
                          Cambiar fase
                        </button>
                      )}

                      {!isInscribed && !isTerminal && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setTransformTarget(e)}
                          className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Convertir a familia
                        </button>
                      )}

                      {!isTerminal && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setDropTarget(e)}
                          className="text-xs text-fm-error hover:underline disabled:opacity-50"
                        >
                          Descartar
                        </button>
                      )}
                      {isTerminal && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleReopen(e.id)}
                          className="text-xs text-fm-primary hover:underline disabled:opacity-50"
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phase select modal */}
      {phaseTarget && (
        <PhaseSelectModal
          entry={phaseTarget}
          phaseCatalog={phaseCatalog}
          isPending={isPending}
          onClose={() => setPhaseTarget(null)}
          onAdvance={(toCode) => {
            setPhaseTarget(null)
            handleAdvanceTo(phaseTarget.id, toCode)
          }}
        />
      )}

      {/* Transform modal */}
      {transformTarget && (
        <TransformWaitlistModal
          entry={transformTarget}
          onClose={() => setTransformTarget(null)}
        />
      )}

      {/* Drop modal */}
      {dropTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-base font-semibold text-fm-on-surface">
              Descartar entrada
            </h3>
            <p className="text-xs text-fm-on-surface-variant">
              ¿Por qué se descarta a {dropTarget.child_full_name}? Pasa a fase{' '}
              <strong>5.2 Retirado</strong>.
            </p>
            <textarea
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              rows={3}
              placeholder="Ej: se fue a otra clínica, no contesta, etc."
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => { setDropTarget(null); setDropReason('') }}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmDrop}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-error text-white font-semibold hover:bg-fm-error/90 disabled:opacity-60"
              >
                {isPending ? 'Descartando…' : 'Descartar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Modal de selección de fase (reutiliza el mismo patrón que DetailModal)
// ──────────────────────────────────────────────────────────────────────────

function PhaseSelectModal({
  entry,
  phaseCatalog,
  isPending,
  onClose,
  onAdvance,
}: {
  entry: WaitlistEntry
  phaseCatalog: IntakePhaseCatalogEntry[]
  isPending: boolean
  onClose: () => void
  onAdvance: (toCode: string) => void
}) {
  const visiblePhases = useMemo(
    () => phaseCatalog.filter((p) => p.is_waitlist_visible).sort((a, b) => a.sort_order - b.sort_order),
    [phaseCatalog],
  )
  const groups = useMemo(() => groupPhaseCatalog(visiblePhases), [visiblePhases])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-fm-outline-variant/15">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
                {entry.child_full_name}
              </p>
              <h3 className="text-base font-bold text-fm-on-surface mt-0.5">
                Seleccionar nueva fase
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-fm-on-surface-variant hover:text-fm-on-surface mt-0.5"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Phase list — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => {
            const palette = PHASE_GROUP_COLORS[g.group_number as PhaseGroupNumber]
            return (
              <div key={g.group_number} className="border-b border-fm-outline-variant/10 last:border-0">
                <div className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider ${palette.bg} ${palette.text}`}>
                  {g.group_number}. {g.group_name}
                  <span className="ml-1 normal-case font-normal opacity-70">
                    · {PHASE_GROUP_LABELS[g.group_number as PhaseGroupNumber]}
                  </span>
                </div>
                <ul>
                  {g.phases.map((p) => {
                    const isCurrent = p.code === entry.current_phase_code
                    return (
                      <li key={p.code}>
                        <button
                          type="button"
                          disabled={isCurrent || isPending}
                          onClick={() => onAdvance(p.code)}
                          className={`w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-fm-surface-container transition-colors disabled:cursor-not-allowed ${
                            isCurrent ? 'bg-fm-surface-container-low' : ''
                          }`}
                        >
                          <span className="font-mono text-[11px] text-fm-on-surface-variant w-6 flex-shrink-0">
                            {p.group_number}.{p.sub_order}
                          </span>
                          <span className="flex-1 text-sm">
                            <span className={`font-medium ${isCurrent ? 'text-fm-primary' : 'text-fm-on-surface'}`}>
                              {p.label}
                            </span>
                            {p.is_optional && (
                              <span className="ml-2 text-[10px] uppercase text-fm-on-surface-variant">
                                opcional
                              </span>
                            )}
                          </span>
                          {isCurrent && (
                            <span className="material-symbols-outlined text-fm-primary text-base flex-shrink-0">
                              check_circle
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-fm-outline-variant/15">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-fm-on-surface-variant hover:text-fm-on-surface"
          >
            ← Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
