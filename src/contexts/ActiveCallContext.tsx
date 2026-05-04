'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ActiveCallInfo } from '@/types/db'

interface ActiveCallContextValue {
  activeCall: ActiveCallInfo | null
  minimized: boolean
  fullscreen: boolean
  startActiveCall: (info: ActiveCallInfo) => void
  endActiveCall: () => void
  setMinimized: (m: boolean) => void
  setFullscreen: (f: boolean) => void
}

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null)

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const startActiveCall = useCallback((info: ActiveCallInfo) => {
    setActiveCall(info)
    setMinimized(false)
    setFullscreen(false)
  }, [])

  const endActiveCall = useCallback(() => {
    setActiveCall(null)
    setMinimized(false)
    setFullscreen(false)
  }, [])

  // Cuando el otro lado cuelga (o el ringtone expira sin respuesta), la sesión
  // queda con `ended_at` en la DB. Realtime nos avisa y aquí terminamos la
  // active call local automáticamente — sin que el usuario quede colgado en
  // un room vacío.
  useEffect(() => {
    if (!activeCall) return
    const supabase = createClient()
    const channel = supabase
      .channel(`active-call-watch-${activeCall.sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `id=eq.${activeCall.sessionId}`,
        },
        (payload) => {
          const row = payload.new as { ended_at?: string | null }
          if (row.ended_at) {
            endActiveCall()
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeCall, endActiveCall])

  const value = useMemo<ActiveCallContextValue>(
    () => ({
      activeCall,
      minimized,
      fullscreen,
      startActiveCall,
      endActiveCall,
      setMinimized,
      setFullscreen,
    }),
    [activeCall, minimized, fullscreen, startActiveCall, endActiveCall]
  )

  return <ActiveCallContext.Provider value={value}>{children}</ActiveCallContext.Provider>
}

export function useActiveCall(): ActiveCallContextValue {
  const ctx = useContext(ActiveCallContext)
  if (!ctx) throw new Error('useActiveCall debe usarse dentro de <ActiveCallProvider>')
  return ctx
}

export function useActiveCallOrNull(): ActiveCallContextValue | null {
  return useContext(ActiveCallContext)
}
