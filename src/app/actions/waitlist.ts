'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * Vuelve una entrada agendada al estado 'contacted'. Útil cuando alguien
 * marcó por error o la familia se arrepiente antes de la primera cita.
 * Limpia `scheduled_child_id` pero NO borra la familia/niño si ya existe;
 * el coordinador debe decidir qué hacer con esa data manualmente.
 */
export async function revertScheduledToContacted(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'contacted',
      scheduled_child_id: null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/lista-de-espera')
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

/**
 * Transforma una entrada de lista de espera en familia + niño.
 *
 * Flujo:
 *   1. Valida la entrada (debe estar en 'waiting' o 'contacted')
 *   2. Inserta una nueva `families` con datos del padre/madre
 *   3. Inserta un `children` vinculado a esa family (code se autoasigna por trigger)
 *   4. Marca la entrada como 'scheduled' con scheduled_child_id apuntando al niño
 *
 * Usa admin client para evitar problemas de RLS y permitir rollback parcial si
 * el child falla (se elimina la familia recién creada).
 */
export interface TransformWaitlistInput {
  entryId: string
  /** Apellido/identificador de la familia (default: primary_contact_name de la entrada). */
  primaryContactName?: string
  primaryContactPhone?: string | null
  primaryContactEmail?: string | null
  /** Datos opcionales adicionales para la familia */
  secondaryContactName?: string | null
  secondaryContactPhone?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelation?: string | null
  familyNotes?: string | null
  /** Nombre completo del niño (default: child_full_name de la entrada). */
  childFullName?: string
  preferredName?: string | null
  /** Fecha de nacimiento del niño (default: child_birthdate de la entrada). */
  birthDate?: string | null
  gender?: 'M' | 'F' | 'other' | null
  /** Texto libre del diagnóstico (default: child_diagnosis de la entrada). */
  diagnosesDisplayText?: string | null
  childNotes?: string | null
}

export async function transformWaitlistEntryToFamily(
  input: TransformWaitlistInput,
): Promise<
  | { ok: true; familyId: string; childId: string; childCode: string | null }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  // 1. Cargar entrada
  const { data: entryRow, error: entryErr } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('id', input.entryId)
    .maybeSingle()
  if (entryErr) return { ok: false, error: entryErr.message }
  if (!entryRow) return { ok: false, error: 'Entrada no encontrada.' }
  const entry = entryRow as WaitlistEntry

  if (entry.status === 'scheduled') {
    return { ok: false, error: 'Esta entrada ya fue convertida en familia.' }
  }
  if (entry.status === 'dropped') {
    return { ok: false, error: 'No se puede transformar una entrada descartada. Reabrirla primero.' }
  }

  // 2. Resolver datos finales (override con input, default con entry)
  const familyName = (input.primaryContactName ?? entry.parent_full_name).trim()
  const childName = (input.childFullName ?? entry.child_full_name).trim()
  if (!familyName) return { ok: false, error: 'El nombre del contacto principal es obligatorio.' }
  if (!childName) return { ok: false, error: 'El nombre del niño es obligatorio.' }

  const admin = createAdminClient()

  // 3. Insertar familia
  const { data: createdFamily, error: familyErr } = await admin
    .from('families')
    .insert({
      primary_contact_name: familyName,
      primary_contact_phone: (input.primaryContactPhone ?? entry.parent_phone)?.trim() || null,
      primary_contact_email: (input.primaryContactEmail ?? entry.parent_email)?.trim() || null,
      secondary_contact_name: input.secondaryContactName?.trim() || null,
      secondary_contact_phone: input.secondaryContactPhone?.trim() || null,
      emergency_contact_name: input.emergencyContactName?.trim() || null,
      emergency_contact_phone: input.emergencyContactPhone?.trim() || null,
      emergency_contact_relation: input.emergencyContactRelation?.trim() || null,
      notes: input.familyNotes?.trim() || null,
      created_by_user_id: user.id,
    })
    .select('id')
    .single()

  if (familyErr || !createdFamily) {
    return { ok: false, error: familyErr?.message ?? 'No se pudo crear la familia.' }
  }
  const familyId = createdFamily.id

  // 4. Insertar niño (con rollback de familia si falla)
  const { data: createdChild, error: childErr } = await admin
    .from('children')
    .insert({
      family_id: familyId,
      full_name: childName,
      preferred_name: input.preferredName?.trim() || null,
      birth_date: input.birthDate ?? entry.child_birthdate ?? null,
      gender: input.gender ?? null,
      diagnoses_display_text:
        (input.diagnosesDisplayText ?? entry.child_diagnosis)?.trim() || null,
      referral_source_id: entry.referral_source_id ?? null,
      notes: input.childNotes?.trim() || null,
      created_by_user_id: user.id,
    })
    .select('id, code')
    .single()

  if (childErr || !createdChild) {
    // Rollback: eliminar familia recién creada para no dejar huérfanos
    await admin.from('families').delete().eq('id', familyId).then(() => null)
    return { ok: false, error: childErr?.message ?? 'No se pudo crear el niño.' }
  }
  const childId = createdChild.id
  const childCode = (createdChild.code as string | null) ?? null

  // 5. Marcar la entrada como agendada con link al child
  const { error: updErr } = await admin
    .from('waitlist_entries')
    .update({
      status: 'scheduled',
      scheduled_child_id: childId,
    })
    .eq('id', input.entryId)

  if (updErr) {
    // La familia y niño quedaron creados — el flujo de waitlist quedó inconsistente.
    // Es mejor que el coordinador lo resuelva manualmente que perder los datos.
    return {
      ok: false,
      error: `Familia y niño creados (familyId=${familyId}), pero falló actualizar la lista de espera: ${updErr.message}`,
    }
  }

  revalidatePath('/operacion/lista-de-espera')
  revalidatePath('/familias')
  revalidatePath('/dashboard')
  return { ok: true, familyId, childId, childCode }
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

  if (filters.status) {
    // Filtro explícito (incluye consultar estados terminales para auditoría).
    query = query.eq('status', filters.status)
  } else {
    // Default: solo entradas ACTIVAS (waiting + contacted). Las terminales
    // (scheduled / dropped) se ocultan porque su registro vivo ya está en
    // familias/niños o ya fue descartado.
    query = query.in('status', ['waiting', 'contacted'])
  }
  if (filters.serviceType) query = query.eq('requested_service_type', filters.serviceType)

  const { data } = await query
  return (data ?? []) as WaitlistEntry[]
}
