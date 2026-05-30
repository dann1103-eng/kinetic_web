import type { UserRole } from '@/types/db'

/**
 * Roles con acceso COMPLETO a Facturación (paridad con admin):
 * ver el hub, listados y detalle de facturas/propuestas, y ejecutar
 * acciones (emitir, registrar pago, anular, etc.).
 *
 * Recepción gestiona cobros y facturación día a día, por eso entra aquí.
 * La configuración del emisor (T&C, métodos de pago) sigue siendo admin-only.
 */
export const BILLING_MANAGER_ROLES: UserRole[] = ['admin', 'recepcion']

export function isBillingManager(role: string | null | undefined): boolean {
  return !!role && (BILLING_MANAGER_ROLES as string[]).includes(role)
}
