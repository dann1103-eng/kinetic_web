import type { UserRole } from '@/types/db'

export const canCreateClient      = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canEditClient        = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canDeleteClient      = (role: UserRole | null | undefined) => role === 'admin'
export const canCreateRequirement = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canAssignRequirements= (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canViewReports       = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canViewRenewals      = (role: UserRole | null | undefined) => role === 'admin'
export const canViewPlans         = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canEditPlans         = (role: UserRole | null | undefined) => role === 'admin' || role === 'supervisor'
export const canViewUsers         = (role: UserRole | null | undefined) => role === 'admin'
export const canManageOthersTime  = (role: UserRole | null | undefined) => role === 'admin'
export const canMarkPayment       = (role: UserRole | null | undefined) => role === 'admin'
export const canVoidRequirement   = (role: UserRole | null | undefined) => role === 'admin'

// Gestión de canales de chat (crear, editar nombre/tema, agregar/quitar
// miembros, eliminar). Kinetic: coordinadoras y recepción tienen paridad con
// admin/supervisor. NO cubre moderación de mensajes ajenos (eso sigue admin).
export const canManageChannels    = (role: UserRole | null | undefined) =>
  role === 'admin' || role === 'supervisor' || role === 'coordinadora_familias' ||
  role === 'coordinadora_terapias' || role === 'recepcion'

export const isClientRole = (role: UserRole | null | undefined): role is 'client' =>
  role === 'client'

export const isStaffRole = (role: UserRole | null | undefined): boolean =>
  role === 'admin' || role === 'supervisor' || role === 'operator'

export const canAccessPortal = (role: UserRole | null | undefined): boolean =>
  isClientRole(role)
