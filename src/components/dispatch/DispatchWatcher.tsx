'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  listPendingDispatches,
  dispatchChild,
  snoozeDispatch,
  type PendingDispatch,
} from '@/app/actions/dispatch'
import { PICKUP_GRACE_MINUTES } from '@/lib/domain/billing/late-pickup'

/**
 * Vigila despachos pendientes (terapia finalizada, niño sin recoger).
 * Pasados 15 min sin despachar, muestra un pop-up sincronizado (realtime)
 * a la terapista y a recepción: "¿el niño sigue ahí?".
 *  - "Sí, ya fue despachado" → marca despacho (dispara cargo si corresponde).
 *  - "No lo han traído aún" → pospone el aviso (sincronizado).
 * Al despacharse (por cualquiera de los 2), el realtime quita el pop-up.
 */
export function DispatchWatcher() {
  const [pending, setPending] = useState<PendingDispatch[]>([])
  const [nowMs, setNowMs] = useState(() => new Date().getTime())
  const [isActing, startAct] = useTransition()

  const refresh = useCallback(() => {
    listPendingDispatches().then(setPending).catch(() => {})
  }, [])

  // Fetch inicial + realtime + tick de tiempo.
  useEffect(() => {
    refresh()
    const supabase = createClient()
    const channel = supabase
      .channel('dispatch-watcher')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => refresh(),
      )
      .subscribe()
    const tick = setInterval(() => setNowMs(new Date().getTime()), 30_000)
    const poll = setInterval(refresh, 120_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [refresh])

  // Primer despacho vencido (>15 min) y no pospuesto.
  const overdue = pending.find((p) => {
    const elapsedMin = Math.floor((nowMs - new Date(p.completed_at).getTime()) / 60_000)
    if (elapsedMin < PICKUP_GRACE_MINUTES) return false
    if (p.snoozed_until && new Date(p.snoozed_until).getTime() > nowMs) return false
    return true
  })

  if (!overdue) return null

  const elapsedMin = Math.floor((nowMs - new Date(overdue.completed_at).getTime()) / 60_000)

  function handleDispatched() {
    if (!overdue) return
    startAct(async () => {
      await dispatchChild(overdue.id)
      refresh()
    })
  }
  function handleStillWaiting() {
    if (!overdue) return
    startAct(async () => {
      await snoozeDispatch(overdue.id, 10)
      refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-700 text-2xl">schedule</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-fm-on-surface">
            ¿{overdue.child_name} sigue ahí?
          </h3>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            La terapia finalizó hace <b>{elapsedMin} min</b> y el niño/a aún no se marcó
            como despachado. Si pasó la gracia de {PICKUP_GRACE_MINUTES} min, se sugerirá un
            cargo por recogida tardía.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDispatched}
            disabled={isActing}
            className="w-full px-4 py-2.5 rounded-xl bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            Sí, ya fue despachado
          </button>
          <button
            type="button"
            onClick={handleStillWaiting}
            disabled={isActing}
            className="w-full px-4 py-2.5 rounded-xl border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-60"
          >
            No lo han traído aún
          </button>
        </div>
      </div>
    </div>
  )
}
