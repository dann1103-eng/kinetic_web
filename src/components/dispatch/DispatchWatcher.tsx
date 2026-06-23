'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  listPendingDispatches,
  listReceptionQueue,
  dispatchChild,
  dispatchAndCharge,
  snoozeDispatch,
  type PendingDispatch,
  type ReceptionQueueItem,
} from '@/app/actions/dispatch'
import {
  PICKUP_GRACE_MINUTES,
  computeLatePickup,
} from '@/lib/domain/billing/late-pickup'

// ── Componente selector por rol ───────────────────────────────────────────────
interface DispatchWatcherProps {
  currentUserRole: string
}

export function DispatchWatcher({ currentUserRole }: DispatchWatcherProps) {
  if (currentUserRole === 'recepcion') return <ReceptionDispatchQueue />
  // Safety-net para terapistas/maestras y gestión.
  return <TherapistDispatchPopup />
}

// ── Cola de recepción — tarjetas flotantes ────────────────────────────────────
function ReceptionDispatchQueue() {
  const [queue, setQueue] = useState<ReceptionQueueItem[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Snooze client-side: oculta la tarjeta localmente sin escribir a DB.
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({})

  const refresh = useCallback(() => {
    listReceptionQueue().then(setQueue).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel('reception-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refresh)
      .subscribe()
    const tick = setInterval(() => setNowMs(Date.now()), 5_000)
    const poll = setInterval(refresh, 60_000)
    return () => { supabase.removeChannel(ch); clearInterval(tick); clearInterval(poll) }
  }, [refresh])

  const visible = queue.filter((item) => {
    const until = snoozedUntil[item.id]
    return !until || until < nowMs
  })

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 max-w-sm w-full">
      {visible.map((item) => (
        <ReceptionCard
          key={item.id}
          item={item}
          nowMs={nowMs}
          onSnooze={(id) => setSnoozedUntil((prev) => ({
            ...prev,
            [id]: Date.now() + 10 * 60_000,
          }))}
          onDispatched={refresh}
        />
      ))}
    </div>
  )
}

// ── Tarjeta individual de recepción ───────────────────────────────────────────
function ReceptionCard({
  item,
  nowMs,
  onSnooze,
  onDispatched,
}: {
  item: ReceptionQueueItem
  nowMs: number
  onSnooze: (id: string) => void
  onDispatched: () => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isActing, startAct] = useTransition()

  const elapsed = useMemo(
    () => computeLatePickup(item.handed_to_reception_at, new Date(nowMs).toISOString()),
    [item.handed_to_reception_at, nowMs],
  )
  const isOverdue = elapsed.minutes >= PICKUP_GRACE_MINUTES
  const timerLabel = `${String(Math.floor(elapsed.minutes)).padStart(2, '0')}:${String(
    Math.floor(((nowMs - new Date(item.handed_to_reception_at).getTime()) % 60_000) / 1_000)
  ).padStart(2, '0')}`

  function handleConfirm(action: 'charge' | 'waive' | 'none') {
    setError(null)
    startAct(async () => {
      let res: { ok: boolean; error?: string }
      if (action === 'charge') {
        res = await dispatchAndCharge(item.id)
      } else if (action === 'waive') {
        if (!waiveReason.trim() || waiveReason.trim().length < 3) {
          setError('Escribí un motivo (mín. 3 caracteres).')
          return
        }
        res = await dispatchChild(item.id, 'to_reception', waiveReason)
      } else {
        // Sin cargo
        res = await dispatchChild(item.id, 'to_reception')
      }
      if (!res.ok) { setError(res.error ?? 'Error'); return }
      setShowModal(false)
      onDispatched()
    })
  }

  return (
    <>
      <div className={`bg-white rounded-2xl shadow-xl flex items-center gap-3 px-4 py-3 border-l-4 ${isOverdue ? 'border-l-[#b31b25]' : 'border-l-[#00675c]'}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 truncate">{item.child_name}</p>
          <p className="text-[11px] text-zinc-500">
            En recepción
            {item.service_type && ` · ${item.service_type}`}
            {isOverdue && (
              <span className="ml-1.5 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
                +${elapsed.feeUsd.toFixed(2)}
              </span>
            )}
          </p>
        </div>
        <span className={`text-xl font-extrabold tabular-nums ${isOverdue ? 'text-[#b31b25]' : 'text-[#00675c]'}`}>
          {timerLabel}
        </span>
        <button
          type="button"
          onClick={() => { setShowModal(true); setError(null); setWaiveReason('') }}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#00675c] text-white hover:opacity-90"
        >
          Despachar a papá
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.id)}
          className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
          title="Posponer 10 min"
        >
          ···
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-base font-bold text-zinc-900">Despachar a papá</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {item.child_name} · {elapsed.minutes} min en recepción
              </p>
            </div>

            {isOverdue ? (
              <>
                <div className="bg-amber-50 rounded-xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Cargo por recogida tardía</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      {elapsed.minutes} min (+{elapsed.minutes - PICKUP_GRACE_MINUTES} min sobre gracia)
                    </p>
                  </div>
                  <p className="text-xl font-extrabold text-amber-700">${elapsed.feeUsd.toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Motivo para perdonar (opcional)
                  </label>
                  <input
                    type="text"
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    placeholder="Ej: acuerdo con la familia"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                {error && <p className="text-xs text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleConfirm('charge')}
                    className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60"
                  >
                    Cobrar ${elapsed.feeUsd.toFixed(2)}
                  </button>
                  <button
                    type="button"
                    disabled={isActing || waiveReason.trim().length < 3}
                    onClick={() => handleConfirm('waive')}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-zinc-700 text-sm font-bold hover:bg-zinc-200 disabled:opacity-40"
                  >
                    Perdonar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-emerald-50 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-800">
                  ✓ Dentro del tiempo de gracia — sin cargo
                </div>
                {error && <p className="text-xs text-red-700">{error}</p>}
                <button
                  type="button"
                  disabled={isActing}
                  onClick={() => handleConfirm('none')}
                  className="w-full py-2.5 rounded-xl bg-[#00675c] text-white text-sm font-bold hover:opacity-90 disabled:opacity-60"
                >
                  {isActing ? 'Guardando…' : 'Confirmar despacho'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Safety-net popup para terapistas/maestras y gestión ───────────────────────
function TherapistDispatchPopup() {
  const [pending, setPending] = useState<PendingDispatch[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isActing, startAct] = useTransition()

  const refresh = useCallback(() => {
    listPendingDispatches().then(setPending).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel('dispatch-watcher')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refresh)
      .subscribe()
    const tick = setInterval(() => setNowMs(Date.now()), 30_000)
    const poll = setInterval(refresh, 120_000)
    return () => { supabase.removeChannel(ch); clearInterval(tick); clearInterval(poll) }
  }, [refresh])

  const overdue = pending.find((p) => {
    const elapsed = Math.floor((nowMs - new Date(p.completed_at).getTime()) / 60_000)
    if (elapsed < PICKUP_GRACE_MINUTES) return false
    if (p.snoozed_until && new Date(p.snoozed_until).getTime() > nowMs) return false
    return true
  })

  if (!overdue) return null
  const elapsedMin = Math.floor((nowMs - new Date(overdue.completed_at).getTime()) / 60_000)

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
            La terapia finalizó hace <b>{elapsedMin} min</b>. Usá los botones de
            &ldquo;Entregar&rdquo; en tu tarjeta de sesión, o confirmá aquí si
            ya fue despachado.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => startAct(async () => {
              await dispatchChild(overdue.id, 'to_parent')
              refresh()
            })}
            disabled={isActing}
            className="w-full px-4 py-2.5 rounded-xl bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            Sí, ya fue despachado
          </button>
          <button
            type="button"
            onClick={() => startAct(async () => {
              await snoozeDispatch(overdue.id, 10)
              refresh()
            })}
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
