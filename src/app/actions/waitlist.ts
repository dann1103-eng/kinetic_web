'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { ServiceType, WaitlistEntry, WaitlistStatus } from '@/types/db'

const COORD_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isCoord(role: string): boolean {
  return (COORD_ROLES as readonly string[]).includes(role)
}

export interface CreateWaitlistInput {
  childFullName: string
  childBirthdate?: string | null
  childDiagnosis?: string | null
  parentFullName: string
  parentPhone: string
  parentEmail?: string | null
  requestedServiceType: ServiceType
  preferredTherapistId?: string | null
  preferredDays?: string | null
  notes?: string | null
  referralSourceId?: string | null
  priority?: 0 | 1 | 2
}

export async function createWaitlistEntry(
  input: CreateWaitlistInput,
): Promise<{ ok: true; entry: WaitlistEntry } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) {
    return { ok: false, error: 'No autorizado.' }
  }
  if (!input.childFullName.trim()) {
    return { ok: false, error: 'El nombre del niño es requerido.' }
  }
  if (!input.parentFullName.trim()) {
    return { ok: false, error: 'El nombre del padre/madre es requerido.' }
  }
  if (!input.parentPhone.trim()) {
    return { ok: false, error: 'El teléfono de contacto es requerido.' }
  }
  if (!input.requestedServiceType) {
    return { ok: false, error: 'El tipo de terapia es requerido.' }
  }

  const { data, error } = await supabase
    .from('waitlist_entries')
    .insert({
      child_full_name: input.childFullName.trim(),
      child_birthdate: input.childBirthdate || null,
      child_diagnosis: input.childDiagnosis?.trim() || null,
      parent_full_name: input.parentFullName.trim(),
      parent_phone: input.parentPhone.trim(),
      parent_email: input.parentEmail?.trim() || null,
      requested_service_type: input.requestedServiceType,
      preferred_therapist_id: input.preferredTherapistId || null,
      preferred_days: input.preferredDays?.trim() || null,
      notes: input.notes?.trim() || null,
      referral_source_id: input.referralSourceId || null,
      priority: input.priority ?? 0,
      added_by_user_id: user.id,
    })
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo crear la entrada.' }
  }

  revalidatePath('/operacion/lista-de-espera')
  revalidatePath('/dashboard')
  return { ok: true, entry: data as WaitlistEntry }
}

export async function markContacted(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
      contacted_by_user_id: user.id,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/lista-de-espera')
  return { ok: true }
}

export async function markScheduled(
  id: string,
  childId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'scheduled',
      scheduled_child_id: childId ?? null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/lista-de-espera')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function dropEntry(
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }
  if (reason.trim().length < 3) {
    return { ok: false, error: 'El motivo debe tener al menos 3 caracteres.' }
  }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'dropped',
      dropped_at: new Date().toISOString(),
      dropped_reason: reason.trim(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/lista-de-espera')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function reopenEntry(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'waiting',
      contacted_at: null,
      contacted_by_user_id: null,
      dropped_at: null,
      dropped_reason: null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/lista-de-espera')
  return { ok: true }
}

export interface ListWaitlistFilters {
  status?: WaitlistStatus
  serviceType?: ServiceType
}

export async function listWaitlist(
  filters: ListWaitlistFilters = {},
): Promise<WaitlistEntry[]> {
  const { supabase } = await getActor()

  let query = supabase
    .from('waitlist_entries')
    .select('*')
    .order('priority', { ascending: false })
    .order('added_at', { ascending: true })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.serviceType) query = query.eq('requested_service_type', filters.serviceType)

  const { data } = await query
  return (data ?? []) as WaitlistEntry[]
}
