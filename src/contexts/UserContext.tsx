'use client'

import { createContext, useContext } from 'react'
import type { AppUser } from '@/types/db'

const UserContext = createContext<AppUser | null>(null)

interface ImpersonationContextValue {
  isImpersonating: boolean
  realAdminName: string | null
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  isImpersonating: false,
  realAdminName: null,
})

export function UserProvider({
  user,
  isImpersonating = false,
  realAdminName = null,
  children,
}: {
  user: AppUser
  isImpersonating?: boolean
  realAdminName?: string | null
  children: React.ReactNode
}) {
  return (
    <UserContext.Provider value={user}>
      <ImpersonationContext.Provider value={{ isImpersonating, realAdminName }}>
        {children}
      </ImpersonationContext.Provider>
    </UserContext.Provider>
  )
}

export function useUser(): AppUser {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used inside UserProvider')
  return ctx
}

/** Variante no-throw: retorna null si no hay UserProvider en el árbol (ej. portal cliente). */
export function useUserOrNull(): AppUser | null {
  return useContext(UserContext)
}

/** Hook para detectar y exhibir el modo espectador (impersonación de admin). */
export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext)
}
