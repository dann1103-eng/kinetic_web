'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { startRequirementTimer, stopActiveEntry } from '@/app/actions/time'
import { formatDuration } from '@/lib/domain/time'
import type { Phase, Requirement } from '@/types/db'
import { PHASE_LABELS } from '@/lib/domain/pipeline'

interface Props {
  matrices: Pick<Requirement, 'id' | 'title' | 'notes' | 'phase' | 'deadline' | 'registered_at'>[]
  currentUserId: string
}

export function MatrixContentCard({ matrices, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeReqId, setActiveReqId] = useState<string | null>(null)
  const [totalsByReq, setTotalsByReq] = useState<Record<string, number>>({})
  const [tick, setTick] = useState(0)

  // Cargar tiempo total y la entrada activa del usuario
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const ids = matrices.map((m) => m.id)
    if (ids.length === 0) return

    Promise.all([
      supabase
        .from('time_entries')
        .select('requirement_id, duration_seconds, started_at, ended_at')
        .eq('user_id', currentUserId)
        .in('requirement_id', ids),
      supabase
        .from('time_entries')
        .select('id, requirement_id, started_at')
        .eq('user_id', currentUserId)
        .is('ended_at', null)
        .in('requirement_id', ids)
        .maybeSingle(),
    ]).then(([{ data: entries }, { data: act }]) => {
      if (cancelled) return
      const totals: Record<string, number> = {}
      for (const e of (entries ?? []) as Array<{ requirement_id: string; duration_seconds: number | null; started_at: string; ended_at: string | null }>) {
        const id = e.requirement_id
        if (!id) continue
        if (e.ended_at) totals[id] = (totals[id] ?? 0) + (e.duration_seconds ?? 0)
        else {
          const live = Math.round((new Date().getTime() - new Date(e.started_at).getTime()) / 1000)
          totals[id] = (totals[id] ?? 0) + live
        }
      }
      setTotalsByReq(totals)
      setActiveReqId((act as { requirement_id?: string } | null)?.requirement_id ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [matrices, currentUserId, tick])

  // Refresh cronómetro vivo cada 30s mientras hay activo
  useEffect(() => {
    if (!activeReqId) return
    const i = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(i)
  }, [activeReqId])

  function handleStart(req: Props['matrices'][number]) {
    setError(null)
    startTransition(async () => {
      // Si hay otro timer activo, detenerlo primero
      const supabase = createClient()
      const { data: anyActive } = await supabase
        .from('time_entries')
        .select('id, requirement_id')
        .eq('user_id', currentUserId)
        .is('ended_at', null)
        .maybeSingle()
      if (anyActive) {
        if (!confirm('Ya tienes un timer activo. ¿Detenerlo e iniciar el de esta matriz?')) return
        await stopActiveEntry()
      }
      const r = await startRequirementTimer(req.id, req.title || 'Matriz de contenido', req.phase)
      if ('error' in r) {
        setError(r.error ?? 'No se pudo iniciar el timer')
        return
      }
      setActiveReqId(req.id)
      setTick((t) => t + 1)
      router.refresh()
    })
  }

  function handleStop() {
    setError(null)
    startTransition(async () => {
      const r = await stopActiveEntry()
      if ('error' in r) {
        setError(r.error ?? 'No se pudo detener el timer')
        return
      }
      setActiveReqId(null)
      setTick((t) => t + 1)
      router.refresh()
    })
  }

  if (matrices.length === 0) return null

  return (
    <section className="glass-panel rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-fm-primary text-xl">grid_view</span>
        <h2 className="text-base font-semibold text-fm-on-surface">Matrices de contenido del ciclo</h2>
        <span className="text-xs text-fm-on-surface-variant ml-1">— marca el tiempo que dedicas a cada matriz</span>
      </div>

      {error && (
        <p className="text-xs text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matrices.map((m) => {
          const isActive = activeReqId === m.id
          const total = totalsByReq[m.id] ?? 0
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${
                isActive
                  ? 'bg-fm-primary/8 border-fm-primary/40'
                  : 'bg-fm-surface-container-low border-fm-surface-container-high'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fm-on-surface truncate">{m.title || 'Matriz de contenido'}</p>
                  <p className="text-[11px] text-fm-on-surface-variant mt-0.5">
                    {PHASE_LABELS[m.phase as Phase] ?? m.phase}
                    {m.deadline && ` · entrega ${m.deadline}`}
                  </p>
                </div>
                <span className="text-xs font-bold tabular-nums text-fm-on-surface whitespace-nowrap">
                  {formatDuration(total)}
                </span>
              </div>

              {m.notes && (
                <p className="text-xs text-fm-on-surface-variant whitespace-pre-wrap break-words line-clamp-3">
                  {m.notes}
                </p>
              )}

              {isActive ? (
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={isPending}
                  className="mt-1 px-3 py-1.5 rounded-full bg-fm-error/10 text-fm-error border border-fm-error/30 text-xs font-semibold hover:bg-fm-error/15 disabled:opacity-60"
                >
                  Detener timer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStart(m)}
                  disabled={isPending}
                  className="mt-1 px-3 py-1.5 rounded-full bg-fm-primary text-white text-xs font-semibold hover:bg-fm-primary-dim disabled:opacity-60"
                >
                  Iniciar timer
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
