'use client'

import { useImpersonation } from '@/contexts/UserContext'

/**
 * Returns true cuando el admin está en modo espectador.
 * Componentes con botones de mutación deben deshabilitarlos cuando esto es true.
 * Es solo defensa-en-profundidad UI — el server enforza con `assertNotImpersonating()`.
 */
export function useReadOnly(): boolean {
  return useImpersonation().isImpersonating
}
