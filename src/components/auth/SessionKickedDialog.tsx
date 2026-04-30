'use client'

import { useEffect, useRef, useState } from 'react'
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications'

interface SessionKickedDialogProps {
  open: boolean
  /** Segundos de countdown antes del logout forzado (default: 10). */
  countdownSeconds?: number
}

/**
 * Modal bloqueante que aparece cuando otro dispositivo inició sesión con la
 * misma cuenta. No es cerrable por el usuario — al expirar el countdown se
 * limpia el localStorage y se redirige a /auth/signout.
 */
export function SessionKickedDialog({
  open,
  countdownSeconds = 10,
}: SessionKickedDialogProps) {
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

    // Notificar al SO porque la pestaña probablemente no está activa.
    dispatchBrowserNotif({
      title: 'Sesión cerrada en otro dispositivo',
      body: 'Otro dispositivo inició sesión con tu cuenta. Cerrando sesión…',
      tag: 'session-kicked',
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
            try {
              localStorage.removeItem('fm_session_id')
            } catch {
              /* ignore */
            }
            window.location.href = '/auth/signout'
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-fm-surface-container-lowest rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4 border border-fm-error/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-fm-error/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-fm-error text-2xl">
              devices
            </span>
          </div>
          <div>
            <p className="text-lg font-extrabold text-fm-on-surface">
              Sesión cerrada en otro dispositivo
            </p>
            <p className="text-xs text-fm-on-surface-variant">
              Otro dispositivo inició sesión con tu cuenta.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-fm-error/5 border border-fm-error/20 p-4 text-center">
          <p className="text-[10px] uppercase tracking-widest text-fm-error/80 font-bold">
            Cerrando sesión en
          </p>
          <p className="text-4xl font-black text-fm-error tabular-nums mt-1">
            {remaining}s
          </p>
        </div>

        <p className="text-xs text-fm-on-surface-variant">
          Por seguridad, solo se permite una sesión activa por cuenta. Si fuiste
          tú, ignora este mensaje. Si no, cambia tu contraseña al volver a
          ingresar.
        </p>
      </div>
    </div>
  )
}
