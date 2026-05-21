'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { ReferralChannel, ServiceType, WaitlistEntry } from '@/types/db'

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

// ──────────────────────────────────────────────────────────────────────────
// Creación de entrada
// ──────────────────────────────────────────────────────────────────────────

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
  // Campos del Google Form (mig 0122)
  childAgeText?: string | null
  hasPreviousEvaluation?: boolean | null
  referralChannel?: ReferralChannel | null
  referralChannelOther?: string | null
  interestText?: string | null
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
      child_age_text: input.childAgeText?.trim() || null,
      has_previous_evaluation:
        input.hasPreviousEvaluation === undefined ? null : input.hasPreviousEvaluation,
      referral_channel: input.referralChannel ?? null,
      referral_channel_other: input.referralChannelOther?.trim() || null,
      interest_text: input.interestText?.trim() || null,
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

// ──────────────────────────────────────────────────────────────────────────
// Listado
// ──────────────────────────────────────────────────────────────────────────

export interface ListWaitlistFilters {
  serviceType?: ServiceType
  /** Filtrar por código de sub-fase exacto del catálogo. */
  phaseCode?: string
  /** Filtrar por grupo (1-5). Mutuamente exclusivo con phaseCode. */
  phaseGroup?: 1 | 2 | 3 | 4 | 5
  /** Si true, también muestra entradas en fases terminales (5.x) y boundary (3.2). */
  includeHistorical?: boolean
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

  if (filters.phaseCode) {
    query = query.eq('current_phase_code', filters.phaseCode)
  } else if (filters.phaseGroup) {
    query = query.like('current_phase_code', `${filters.phaseGroup}_%`)
  }

  if (!filters.includeHistorical) {
    // Default: ocultar terminales (5_x) y la boundary (3_2) que ya tiene child creado.
    query = query.not('current_phase_code', 'in', '(3_2_inscripcion_activa,5_1_alta_terapeutica,5_2_retirado)')
  }

  if (filters.serviceType) query = query.eq('requested_service_type', filters.serviceType)

  const { data } = await query
  return (data ?? []) as WaitlistEntry[]
}

// ──────────────────────────────────────────────────────────────────────────
// Transformación manual a familia (override admin con formulario completo)
// ──────────────────────────────────────────────────────────────────────────
//
// La transformación automática vive en `advanceWaitlistPhase` (intake-pipeline.ts)
// y se dispara al avanzar a `3_2_inscripcion_activa`. Esta versión exportada
// queda como flow alternativo cuando recepción quiere setear datos extra
// (segundo contacto, emergency contact, gender, etc.) antes de crear.

export interface TransformWaitlistInput {
  entryId: string
  primaryContactName?: string
  primaryContactPhone?: string | null
  primaryContactEmail?: string | null
  secondaryContactName?: string | null
  secondaryContactPhone?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelation?: string | null
  familyNotes?: string | null
  childFullName?: string
  preferredName?: string | null
  birthDate?: string | null
  gender?: 'M' | 'F' | 'other' | null
  diagnosesDisplayText?: string | null
  childNotes?: string | null
}

export async function transformWaitlistEntryToFamily(
  input: TransformWaitlistInput,
): Promise<
  | { ok: true; familyId: string; childId: string; childCode: string | null }
  | { ok: false; error: string }
> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const { data: entryRow, error: entryErr } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('id', input.entryId)
    .maybeSingle()
  if (entryErr) return { ok: false, error: entryErr.message }
  if (!entryRow) return { ok: false, error: 'Entrada no encontrada.' }
  const entry = entryRow as WaitlistEntry

  if (entry.scheduled_child_id) {
    return { ok: false, error: 'Esta entrada ya fue convertida en familia.' }
  }

  const familyName = (input.primaryContactName ?? entry.parent_full_name).trim()
  const childName = (input.childFullName ?? entry.child_full_name).trim()
  if (!familyName) return { ok: false, error: 'El nombre del contacto principal es obligatorio.' }
  if (!childName) return { ok: false, error: 'El nombre del niño es obligatorio.' }

  const admin = createAdminClient()

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
      current_phase_code: '3_3_activo_en_terapias',
    })
    .select('id, code')
    .single()

  if (childErr || !createdChild) {
    await admin.from('families').delete().eq('id', familyId).then(() => null)
    return { ok: false, error: childErr?.message ?? 'No se pudo crear el niño.' }
  }
  const childId = createdChild.id
  const childCode = (createdChild.code as string | null) ?? null

  const { error: updErr } = await admin
    .from('waitlist_entries')
    .update({
      scheduled_child_id: childId,
      current_phase_code: '3_2_inscripcion_activa',
    })
    .eq('id', input.entryId)

  if (updErr) {
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
