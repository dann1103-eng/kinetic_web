'use client'

import { useEffect, useRef, useState } from 'react'
import { endShift } from '@/app/actions/work-sessions'
import { stopActiveEntry } from '@/app/actions/time'
import { clearAllTimerKeysForUser } from '@/lib/domain/timer'
import { createClient } from '@/lib/supabase/client'
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications'

interface StillOnlineDialogProps {
  open: boolean
  /** Segundos de countdown antes de force logout (default: 60). */
  countdownSeconds?: number
  /** Llamado cuando el usuario confirma "sigo aquí". */
  onAcknowledge: () => void
  /** Llamado tras force logout completo (cleanup en parent). */
  onForceLogout?: () => void
}

/**
 * Modal "¿Sigues en línea?" — se muestra a las 6pm y cada 2h durante la noche.
 * Si el usuario no responde en `countdownSeconds`, se cierran timers + jornada
 * + sesión y se redirige a /login.
 */
export function StillOnlineDialog({
  open,
  countdownSeconds = 60,
  onAcknowledge,
  onForceLogout,
}: StillOnlineDialogProps) {
  const [remaining, setRemaining] = useState(countdownSeconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const triggeredRef = useRef(false)
  const { dispatch: dispatchBrowserNotif } = useBrowserNotifications()

  useEffect(() => {
    if (!open) {
      setRemaining(countdownSeconds)
      triggeredRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Disparar browser notif al abrirse (probablemente la pestaña no está activa).
    dispatchBrowserNotif({
      title: '¿Sigues en línea?',
      body: 'Confirma para mantener tu sesión activa.',
      tag: 'still-online',
      force: true,
    })

    setRemaining(countdownSeconds)
    triggeredRef.current = false

    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (!triggeredRef.current) {
            triggeredRef.current = true
            void forceLogout()
          }
          return 0
        }
        return r - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countdownSeconds])

  async function forceLogout() {
    try {
      // Obtener userId antes de cerrar la sesión para poder limpiar localStorage
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      await stopActiveEntry().catch(() => {})
      await endShift().catch(() => {})
      // Limpiar claves de localStorage para evitar timers "fantasma" en el próximo login
      if (authUser) clearAllTimerKeysForUser(authUser.id)
    } finally {
      onForceLogout?.()
      // Redirige al endpoint que limpia la sesión y vuelve a /login
      window.location.href = '/auth/signout'
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-fm-surface-container-lowest rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4 border border-fm-error/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-fm-error/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-fm-error text-2xl">timer</span>
          </div>
          <div>
            <p className="text-lg font-extrabold text-fm-on-surface">¿Sigues en línea?</p>
            <p className="text-xs text-fm-on-surface-variant">
              Cerraremos tu sesión automáticamente si no respondes.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-fm-error/5 border border-fm-error/20 p-4 text-center">
          <p className="text-[10px] uppercase tracking-widest text-fm-error/80 font-bold">Cerrando sesión en</p>
          <p className="text-4xl font-black text-fm-error tabular-nums mt-1">{remaining}s</p>
        </div>

        <p className="text-xs text-fm-on-surface-variant">
          Al cerrar sesión también se detendrán los timers activos (requerimientos, tareas administrativas)
          y se finalizará tu jornada laboral.
        </p>

        <button
          type="button"
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            triggeredRef.current = true
            onAcknowledge()
          }}
          className="w-full px-5 py-3 rounded-full text-white font-bold text-sm"
          style={{ background: 'var(--btn-gradient)' }}
        >
          Sí, sigo aquí
        </button>
      </div>
    </div>
  )
}
