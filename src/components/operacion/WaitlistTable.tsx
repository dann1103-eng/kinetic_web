'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SERVICE_TYPE_LABELS, type WaitlistEntry } from '@/types/db'
import { daysSinceAdded } from '@/lib/domain/waitlist-alerts'
import {
  markContacted,
  markScheduled,
  dropEntry,
  reopenEntry,
  revertScheduledToContacted,
} from '@/app/actions/waitlist'
import { TransformWaitlistModal } from './TransformWaitlistModal'

interface Props {
  entries: WaitlistEntry[]
  therapistsById: Record<string, string>
  /** Mapa de child_id → family_id, para link directo a ficha desde entradas scheduled. */
  familyIdByChildId?: Record<string, string>
}

const PRIORITY_TONE: Record<number, { label: string; bg: string; text: string }> = {
  0: { label: 'Normal', bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' },
  1: { label: 'Alta', bg: 'bg-amber-100', text: 'text-amber-900' },
  2: { label: 'Urgente', bg: 'bg-rose-100', text: 'text-rose-900' },
}

const STATUS_TONE: Record<string, { label: string; bg: string; text: string }> = {
  waiting: { label: 'En espera', bg: 'bg-blue-100', text: 'text-blue-900' },
  contacted: { label: 'Contactada', bg: 'bg-amber-100', text: 'text-amber-900' },
  scheduled: { label: 'Agendada', bg: 'bg-emerald-100', text: 'text-emerald-900' },
  dropped: { label: 'Descartada', bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' },
}

function calcAge(birthdate: string | null): string {
  if (!birthdate) return '—'
  const [y, m, d] = birthdate.split('-').map(Number)
  const dob = new Date(y, m - 1, d)
  const now = new Date()
  let years = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    years--
  }
  if (years < 1) {
    const months = (now.getFullYear() - dob.getFullYear()) * 12 + monthDiff
    return `${months}m`
  }
  return `${years}a`
}

export function WaitlistTable({ entries, therapistsById, familyIdByChildId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<WaitlistEntry | null>(null)
  const [dropReason, setDropReason] = useState('')
  const [transformTarget, setTransformTarget] = useState<WaitlistEntry | null>(null)

  function handleContacted(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await markContacted(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleScheduledManual(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await markScheduled(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleRevertScheduled(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await revertScheduledToContacted(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleReopen(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await reopenEntry(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function confirmDrop() {
    if (!dropTarget) return
    setError(null)
    startTransition(async () => {
      const res = await dropEntry(dropTarget.id, dropReason)
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
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant">Estado</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant text-right">Espera</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-fm-on-surface-variant text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const priority = PRIORITY_TONE[e.priority] ?? PRIORITY_TONE[0]
              const status = STATUS_TONE[e.status]
              const days = daysSinceAdded(e.added_at)
              const preferredTherapist = e.preferred_therapist_id
                ? therapistsById[e.preferred_therapist_id]
                : null
              return (
                <tr
                  key={e.id}
                  className="border-b border-fm-outline-variant/10 last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-fm-on-surface">{e.child_full_name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-fm-on-surface-variant tabular-nums">
                        {calcAge(e.child_birthdate)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${priority.bg} ${priority.text}`}
                      >
                        {priority.label}
                      </span>
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
                    {!preferredTherapist && !e.preferred_days && '—'}
                    {e.notes && (
                      <p className="italic mt-1 line-clamp-2 max-w-[200px]">{e.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${status.bg} ${status.text}`}
                    >
                      {status.label}
                    </span>
                    {e.status === 'dropped' && e.dropped_reason && (
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
                      {e.status === 'waiting' && (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleContacted(e.id)}
                            className="text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
                          >
                            Contactada
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setTransformTarget(e)}
                            className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                          >
                            Convertir a familia
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setDropTarget(e)}
                            className="text-xs text-fm-error hover:underline disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </>
                      )}
                      {e.status === 'contacted' && (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setTransformTarget(e)}
                            className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                          >
                            Convertir a familia
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleScheduledManual(e.id)}
                            className="text-xs text-fm-on-surface-variant hover:underline disabled:opacity-50"
                            title="Marcar como agendada sin crear familia (la familia ya existe)"
                          >
                            Marcar agendada
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleReopen(e.id)}
                            className="text-xs text-fm-on-surface-variant hover:underline disabled:opacity-50"
                          >
                            Volver a espera
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setDropTarget(e)}
                            className="text-xs text-fm-error hover:underline disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </>
                      )}
                      {e.status === 'scheduled' && (
                        <>
                          {(() => {
                            const childId = e.scheduled_child_id
                            const familyId = childId ? familyIdByChildId?.[childId] : undefined
                            if (childId && familyId) {
                              return (
                                <Link
                                  href={`/familias/${familyId}/children/${childId}`}
                                  className="text-xs font-semibold text-fm-primary hover:underline"
                                >
                                  Ver ficha del niño
                                </Link>
                              )
                            }
                            return (
                              <span className="text-[10px] italic text-amber-700 max-w-[140px] text-right">
                                Sin link al niño. Marcala como contactada y volvé a convertir.
                              </span>
                            )
                          })()}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRevertScheduled(e.id)}
                            className="text-xs text-fm-on-surface-variant hover:underline disabled:opacity-50"
                            title="Limpia el link al niño y vuelve la entrada a 'contactada'. La familia y el niño NO se borran."
                          >
                            Volver a contactada
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setDropTarget(e)}
                            className="text-xs text-fm-error hover:underline disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </>
                      )}
                      {e.status === 'dropped' && (
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
              ¿Por qué se descarta a {dropTarget.child_full_name}? (mín. 3 caracteres)
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
                onClick={() => {
                  setDropTarget(null)
                  setDropReason('')
                }}
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
