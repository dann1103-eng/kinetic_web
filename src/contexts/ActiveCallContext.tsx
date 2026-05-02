'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ActiveCallInfo } from '@/types/db'

interface ActiveCallContextValue {
  activeCall: ActiveCallInfo | null
  minimized: boolean
  startActiveCall: (info: ActiveCallInfo) => void
  endActiveCall: () => void
  setMinimized: (m: boolean) => void
}

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null)

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null)
  const [minimized, setMinimized] = useState(false)

  const startActiveCall = useCallback((info: ActiveCallInfo) => {
    setActiveCall(info)
    setMinimized(false)
  }, [])

  const endActiveCall = useCallback(() => {
    setActiveCall(null)
    setMinimized(false)
  }, [])

  const value = useMemo<ActiveCallContextValue>(
    () => ({ activeCall, minimized, startActiveCall, endActiveCall, setMinimized }),
    [activeCall, minimized, startActiveCall, endActiveCall]
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
