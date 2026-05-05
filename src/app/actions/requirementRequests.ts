'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveClientId } from '@/lib/supabase/active-client'
import { assertNotImpersonating } from './impersonation'
import type { ContentType, Priority } from '@/types/db'

export interface RequestRequirementInput {
  contentType: ContentType
  title: string
  description: string
  /**
   * Para reunion/produccion: ISO datetime (starts_at).
   * Para artes (historia, estatico, video_corto, reel, short): fecha YYYY-MM-DD (deadline).
   */
  desiredAt: string
  includesStory?: boolean
}

const ALLOWED_REQUEST_TYPES: ContentType[] = [
  'historia',
  'estatico',
  'video_corto',
  'reel',
  'short',
  'produccion',
  'reunion',
]
const SCHEDULED_TYPES: ContentType[] = ['reunion', 'produccion']

/**
 * Server action invocado desde el portal del cliente. Crea un requirement
 * con `approval_status='pending'` y solo los campos que el cliente puede
 * llenar (título, descripción, fecha deseada). El staff completa lo demás
 * al aprobar.
 */
export async function requestRequirement(
  input: RequestRequirementInput,
): Promise<{ ok: true; id: string } | { error: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (!ALLOWED_REQUEST_TYPES.includes(input.contentType)) {
    return { error: 'Tipo no permitido para solicitudes' }
  }
  if (!input.title.trim()) return { error: 'Ingresa un título' }
  if (!input.desiredAt) return { error: 'Selecciona la fecha deseada' }

  const activeClientId = await getActiveClientId()
  if (!activeClientId) return { error: 'No hay marca activa' }

  // Verifica permiso can_work
  const admin = createAdminClient()
  const { data: link } = await admin
    .from('client_users')
    .select('can_work')
    .eq('user_id', user.id)
    .eq('client_id', activeClientId)
    .maybeSingle()
  if (!link?.can_work) {
    return { error: 'No tienes permiso para solicitar requerimientos en esta marca' }
  }

  // Resuelve ciclo abierto del cliente.
  const { data: cycle } = await admin
    .from('billing_cycles')
    .select('id')
    .eq('client_id', activeClientId)
    .eq('status', 'current')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!cycle) return { error: 'No hay ciclo de facturación activo para esta marca' }

  const isScheduled = SCHEDULED_TYPES.includes(input.contentType)
  // Para reunion/produccion el cliente da datetime → starts_at.
  // Para artes el cliente da date (YYYY-MM-DD) → deadline.
  const startsAt = isScheduled ? input.desiredAt : null
  const deadline = isScheduled ? null : input.desiredAt
  // client_requested_deadline acepta cualquier formato porque es timestamptz nullable;
  // para artes lo guardamos como medianoche local del día.
  const clientRequestedDeadline = isScheduled
    ? input.desiredAt
    : `${input.desiredAt}T00:00:00`

  const { data: inserted, error } = await admin
    .from('requirements')
    .insert({
      billing_cycle_id: cycle.id,
      content_type: input.contentType,
      registered_by_user_id: user.id,
      title: input.title.trim(),
      notes: input.description.trim() || null,
      voided: false,
      over_limit: false,
      phase: 'pendiente',
      carried_over: false,
      cambios_count: 0,
      includes_story: input.includesStory ?? false,
      // Solicitud: marca pending y guarda fecha del cliente
      approval_status: 'pending',
      requested_by_user_id: user.id,
      client_requested_deadline: clientRequestedDeadline,
      client_requested_notes: input.description.trim() || null,
      starts_at: startsAt,
      deadline,
      assigned_to: [],
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('[requestRequirement]', error)
    return { error: 'No se pudo crear la solicitud' }
  }

  revalidatePath('/portal/dashboard')
  revalidatePath('/requirements/solicitudes')
  return { ok: true, id: inserted.id }
}

export interface ApproveRequirementInput {
  requirementId: string
  /** Solo se valida obligatorio para reunion/produccion. Para artes se ignora. */
  estimatedTimeMinutes: number | null
  priority: Priority
  assignedTo: string[]
  deadline: string | null
  /** Solo aplica a reunion/produccion. */
  startsAt: string | null
  consumptionOverridesJson?: Partial<Record<ContentType, number>> | null
}

export async function approveRequirementRequest(
  input: ApproveRequirementInput,
): Promise<{ ok: true } | { error: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Solo admins y supervisores pueden aprobar solicitudes' }
  }

  if (!input.assignedTo.length) return { error: 'Asigna al menos un responsable' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('requirements')
    .select('id, approval_status, content_type')
    .eq('id', input.requirementId)
    .maybeSingle()
  if (!existing) return { error: 'Solicitud no encontrada' }
  if (existing.approval_status !== 'pending') {
    return { error: 'Esta solicitud ya fue procesada' }
  }

  const isScheduled = SCHEDULED_TYPES.includes(existing.content_type as ContentType)
  if (isScheduled) {
    if (!input.estimatedTimeMinutes || input.estimatedTimeMinutes <= 0) {
      return { error: 'Ingresa la duración estimada en minutos' }
    }
    if (!input.startsAt) return { error: 'Selecciona la fecha y hora de inicio' }
  } else {
    if (!input.deadline) return { error: 'Selecciona la fecha de entrega' }
  }

  const { error } = await admin
    .from('requirements')
    .update({
      approval_status: 'approved',
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      estimated_time_minutes: isScheduled ? input.estimatedTimeMinutes : null,
      priority: input.priority,
      assigned_to: input.assignedTo,
      deadline: input.deadline,
      starts_at: isScheduled ? input.startsAt : null,
      consumption_overrides_json: input.consumptionOverridesJson ?? null,
    })
    .eq('id', input.requirementId)

  if (error) {
    console.error('[approveRequirementRequest]', error)
    return { error: 'No se pudo aprobar la solicitud' }
  }

  revalidatePath('/requirements/solicitudes')
  revalidatePath('/pipeline')
  revalidatePath('/calendario')
  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/pipeline')
  return { ok: true }
}

export async function rejectRequirementRequest(
  requirementId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Solo admins y supervisores pueden rechazar solicitudes' }
  }

  if (!reason.trim()) return { error: 'Indica un motivo de rechazo' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('requirements')
    .update({
      approval_status: 'rejected',
      rejected_reason: reason.trim(),
      rejected_at: new Date().toISOString(),
      rejected_by_user_id: user.id,
    })
    .eq('id', requirementId)
    .eq('approval_status', 'pending')

  if (error) {
    console.error('[rejectRequirementRequest]', error)
    return { error: 'No se pudo rechazar la solicitud' }
  }

  revalidatePath('/requirements/solicitudes')
  revalidatePath('/portal/dashboard')
  return { ok: true }
}
