'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { createClient } from '@/lib/supabase/client'
import {
  getMyActiveShift,
  startShift,
  endShift,
  startBreak,
  endBreak,
} from '@/app/actions/work-sessions'
import { stopActiveEntry } from '@/app/actions/time'
import { formatDuration } from '@/lib/domain/time'
import type { WorkSession, WorkSessionBreak } from '@/types/db'
import { EndShiftConfirmDialog } from '@/components/tiempo/EndShiftConfirmDialog'

const SYNC_INTERVAL_MS = 30_000

function elapsedSeconds(from: string, to?: Date): number {
  const end = to ?? new Date()
  return Math.max(0, Math.round((end.getTime() - new Date(from).getTime()) / 1000))
}

function totalBreakSeconds(breaks: WorkSessionBreak[]): number {
  return breaks.reduce((sum, b) => {
    if (b.ended_at) return sum + elapsedSeconds(b.started_at, new Date(b.ended_at))
    return sum + elapsedSeconds(b.started_at)
  }, 0)
}

export function ShiftStatusWidget() {
  const user = useUser()
  const router = useRouter()
  const [shift, setShift] = useState<WorkSession | null>(null)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [endConfirm, setEndConfirm] = useState<{ open: boolean; label: string | null }>({
    open: false,
    label: null,
  })
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cargar shift al montar
  useEffect(() => {
    let cancelled = false
    getMyActiveShift().then((s) => {
      if (!cancelled) setShift(s)
    })
    const sync = window.setInterval(() => {
      getMyActiveShift().then((s) => {
        if (!cancelled) setShift(s)
      })
    }, SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(sync)
    }
  }, [])

  // Cronómetro vivo (1s) — solo si hay shift activa
  useEffect(() => {
    if (!shift) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [shift])

  // Cerrar dropdown al click afuera
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!dropdownRef.current) return
      if (!dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // No mostrar para clientes
  if (user.role === 'client') return null

  function refresh() {
    getMyActiveShift().then(setShift)
  }

  function handle(action: () => Promise<{ ok: true } | { error: string } | { ok: true; sessionId: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await action()
      if ('error' in r) {
        setError(r.error)
        return
      }
      refresh()
      router.refresh()
    })
  }

  async function handleEndShift() {
    setError(null)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      setError('No autenticado')
      return
    }
    const { data: activeEntry } = await supabase
      .from('time_entries')
      .select('id, title, entry_type')
      .eq('user_id', authUser.id)
      .is('ended_at', null)
      .maybeSingle()

    if (activeEntry) {
      const label = activeEntry.title || (activeEntry.entry_type === 'requirement' ? 'requerimiento' : 'tarea administrativa')
      setEndConfirm({ open: true, label })
      return
    }
    handle(() => endShift())
  }

  async function confirmEndShift() {
    setEndConfirm({ open: false, label: null })
    const stopRes = await stopActiveEntry()
    if ('error' in stopRes) {
      setError(stopRes.error ?? 'No se pudo detener el timer activo')
      return
    }
    handle(() => endShift())
  }

  // Stats derivados
  const breaks = (shift?.breaks_json ?? []) as WorkSessionBreak[]
  const elapsed = shift ? elapsedSeconds(shift.started_at) : 0
  const breaksSec = totalBreakSeconds(breaks)
  const onlineSec = Math.max(0, elapsed - breaksSec)
  const onBreak = shift?.status === 'on_lunch' || shift?.status === 'on_away'
  const lastBreak = onBreak && breaks.length > 0 ? breaks[breaks.length - 1] : null

  // Color del dot indicador
  const dotColor = !shift
    ? 'bg-fm-outline-variant'
    : onBreak
      ? 'bg-fm-error animate-pulse'
      : 'bg-fm-primary animate-pulse'

  // Label del botón compacto
  const compactLabel = shift ? formatDuration(onlineSec) : '— : — : —'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container-low transition-colors"
        aria-label="Estado de jornada"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-xs font-bold tabular-nums hidden sm:inline">
          {compactLabel}
        </span>
        <span className="material-symbols-outlined text-[18px] sm:hidden">schedule</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-fm-surface-container-lowest border border-fm-surface-container-high shadow-2xl p-4 z-50">
          {!shift ? (
            <>
              <p className="text-sm font-semibold text-fm-on-surface">Sin jornada activa</p>
              <p className="text-xs text-fm-on-surface-variant mt-0.5 mb-3">
                Inicia tu jornada para comenzar a registrar tu tiempo online.
              </p>
              <button
                type="button"
                onClick={() => handle(() => startShift())}
                disabled={isPending}
                className="w-full px-4 py-2 rounded-full bg-fm-primary text-white font-bold text-sm hover:bg-fm-primary-dim disabled:opacity-60"
              >
                Iniciar jornada
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${onBreak ? 'bg-fm-error' : 'bg-fm-primary animate-pulse'}`} />
                <p className="text-sm font-semibold text-fm-on-surface">
                  {onBreak
                    ? `En ${lastBreak?.type === 'lunch' ? 'almuerzo' : 'away'}`
                    : 'Jornada activa'}
                </p>
                <span className="ml-auto text-[10px] text-fm-on-surface-variant">
                  Inició {new Date(shift.started_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-fm-surface-container-low border border-fm-surface-container-high p-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">Online</p>
                  <p className="text-sm font-bold text-fm-on-surface tabular-nums mt-0.5">{formatDuration(onlineSec)}</p>
                </div>
                <div className="rounded-lg bg-fm-surface-container-low border border-fm-surface-container-high p-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">Pausas</p>
                  <p className="text-sm font-bold text-fm-on-surface tabular-nums mt-0.5">{formatDuration(breaksSec)}</p>
                </div>
                <div className="rounded-lg bg-fm-surface-container-low border border-fm-surface-container-high p-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">Total</p>
                  <p className="text-sm font-bold text-fm-on-surface tabular-nums mt-0.5">{formatDuration(elapsed)}</p>
                </div>
              </div>

              {onBreak ? (
                <button
                  type="button"
                  onClick={() => handle(() => endBreak())}
                  disabled={isPending}
                  className="w-full px-3 py-2 rounded-full bg-fm-primary text-white text-xs font-bold hover:bg-fm-primary-dim disabled:opacity-60"
                >
                  Reanudar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handle(() => startBreak('lunch'))}
                    disabled={isPending}
                    className="flex-1 px-3 py-1.5 rounded-full bg-fm-surface-container-low border border-fm-surface-container-high text-xs font-semibold text-fm-on-surface hover:bg-fm-background disabled:opacity-60"
                  >
                    Almuerzo
                  </button>
                  <button
                    type="button"
                    onClick={() => handle(() => startBreak('away'))}
                    disabled={isPending}
                    className="flex-1 px-3 py-1.5 rounded-full bg-fm-surface-container-low border border-fm-surface-container-high text-xs font-semibold text-fm-on-surface hover:bg-fm-background disabled:opacity-60"
                  >
                    Away
                  </button>
                  <button
                    type="button"
                    onClick={handleEndShift}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-full bg-fm-error/10 text-fm-error border border-fm-error/30 text-xs font-bold hover:bg-fm-error/15 disabled:opacity-60"
                  >
                    Finalizar
                  </button>
                </div>
              )}
            </>
          )}

          {error && <p className="mt-2 text-xs text-fm-error">{error}</p>}
        </div>
      )}

      <EndShiftConfirmDialog
        open={endConfirm.open}
        timerLabel={endConfirm.label}
        onConfirm={confirmEndShift}
        onCancel={() => setEndConfirm({ open: false, label: null })}
      />
    </div>
  )
}
