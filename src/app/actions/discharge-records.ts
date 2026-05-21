'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { calculateDischargeStats } from '@/lib/domain/intake-pipeline'
import type {
  Appointment,
  Child,
  ChildDischargeRecord,
  DischargeChildSnapshot,
  DischargeTherapySnapshot,
  DischargeType,
  TreatmentPlan,
  UserRole,
} from '@/types/db'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const STAFF_THAT_CAN_DRAFT: UserRole[] = [
  'admin',
  'directora',
  'supervisor',
  'coordinadora_familias',
  'coordinadora_terapias',
  'terapista',
  'recepcion',
]

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return {
    supabase,
    user: {
      id: ctx.appUser.id,
      role: ctx.appUser.role as UserRole,
      full_name: ctx.appUser.full_name,
    },
  }
}

/**
 * Crea un draft de alta o retiro con snapshot de los datos del niño,
 * sus terapias y estadísticas de asistencia. Status='draft'.
 */
export async function createDischargeDraft(input: {
  childId: string
  discharge_type: DischargeType
}): Promise<Result<ChildDischargeRecord>> {
  const { user } = await getActor()
  if (!STAFF_THAT_CAN_DRAFT.includes(user.role)) {
    return { ok: false, error: 'Sin permisos para crear alta/retiro.' }
  }

  const admin = createAdminClient()

  // 1. Snapshot del niño
  const { data: childRow } = await admin
    .from('children')
    .select('*')
    .eq('id', input.childId)
    .maybeSingle()
  if (!childRow) return { ok: false, error: 'Niño no encontrado.' }
  const child = childRow as Child

  const childSnapshot: DischargeChildSnapshot = {
    full_name: child.full_name,
    preferred_name: child.preferred_name,
    birth_date: child.birth_date,
    gender: child.gender,
    enrollment_started_at: child.enrollment_started_at,
    diagnoses_display_text: child.diagnoses_display_text,
  }

  // 2. Snapshot de terapias del plan activo
  const { data: planRow } = await admin
    .from('treatment_plans')
    .select('*')
    .eq('child_id', input.childId)
    .eq('active', true)
    .maybeSingle()
  const plan = planRow as TreatmentPlan | null

  const therapies: DischargeTherapySnapshot[] = (plan?.therapies_json ?? [])
    .filter((t) => t.active)
    .map((t) => ({
      service_type: t.service,
      label: t.service,
      started_at: plan?.starts_at ?? null,
      ended_at: null,
      total_sessions: null,
    }))

  // 3. Stats desde appointments
  const { data: apptRows } = await admin
    .from('appointments')
    .select('*')
    .eq('child_id', input.childId)
  const appointments = (apptRows ?? []) as Appointment[]
  const stats = calculateDischargeStats(appointments, input.childId)

  // 4. Insert draft
  const { data: created, error } = await admin
    .from('child_discharge_records')
    .insert({
      child_id: input.childId,
      discharge_type: input.discharge_type,
      child_snapshot_json: childSnapshot,
      therapies_snapshot_json: therapies,
      total_sessions_attended: stats.total_sessions_attended,
      attendance_rate_pct: stats.attendance_rate_pct,
      total_replacements: stats.total_replacements,
      created_by_user_id: user.id,
    })
    .select('*')
    .single()

  if (error || !created) {
    return {
      ok: false,
      error: error?.message ?? 'No se pudo crear el draft de alta.',
    }
  }

  revalidatePath(`/familias/${child.family_id}/children/${input.childId}`)
  return { ok: true, data: created as ChildDischargeRecord }
}

export async function updateDischargeDraft(
  recordId: string,
  patch: {
    objectives_achieved?: string | null
    recommendations?: string | null
    follow_up_plan?: string | null
    discharge_reason?: string | null
    discharge_date?: string
  },
): Promise<Result<null>> {
  const { user } = await getActor()
  if (!STAFF_THAT_CAN_DRAFT.includes(user.role)) {
    return { ok: false, error: 'Sin permisos.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, child_id, created_by_user_id')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }

  if (existing.status !== 'draft' && !['admin', 'directora'].includes(user.role)) {
    return { ok: false, error: 'Solo admin puede editar un alta ya firmada.' }
  }

  const update: Partial<Omit<ChildDischargeRecord, 'id' | 'created_at'>> = {}
  if (patch.objectives_achieved !== undefined) update.objectives_achieved = patch.objectives_achieved
  if (patch.recommendations !== undefined) update.recommendations = patch.recommendations
  if (patch.follow_up_plan !== undefined) update.follow_up_plan = patch.follow_up_plan
  if (patch.discharge_reason !== undefined) update.discharge_reason = patch.discharge_reason
  if (patch.discharge_date !== undefined) update.discharge_date = patch.discharge_date

  if (Object.keys(update).length === 0) return { ok: true, data: null }

  const { error } = await admin
    .from('child_discharge_records')
    .update(update)
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: null }
}

export async function signDischargeAsTherapist(
  recordId: string,
): Promise<Result<null>> {
  const { user } = await getActor()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, child_id')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }
  if (existing.status !== 'draft') {
    return { ok: false, error: 'Solo se puede firmar un draft.' }
  }

  // Validar que el actor es la terapista principal del niño (o admin/directora)
  if (!['admin', 'directora'].includes(user.role)) {
    const { data: plan } = await admin
      .from('treatment_plans')
      .select('primary_therapist_id')
      .eq('child_id', existing.child_id)
      .eq('active', true)
      .maybeSingle()
    const planRow = plan as { primary_therapist_id: string | null } | null
    if (!planRow || planRow.primary_therapist_id !== user.id) {
      return { ok: false, error: 'Solo la terapista principal puede firmar.' }
    }
  }

  const { error } = await admin
    .from('child_discharge_records')
    .update({
      signed_by_therapist_id: user.id,
      signed_by_therapist_name: user.full_name,
      signed_by_therapist_at: new Date().toISOString(),
    })
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: null }
}

export async function signDischargeAsDirectora(
  recordId: string,
): Promise<Result<null>> {
  const { user } = await getActor()
  if (!['admin', 'directora'].includes(user.role)) {
    return { ok: false, error: 'Solo admin/directora puede firmar como tal.' }
  }
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, signed_by_therapist_id, child_id')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }
  if (!existing.signed_by_therapist_id) {
    return { ok: false, error: 'La terapista debe firmar primero.' }
  }

  const { error } = await admin
    .from('child_discharge_records')
    .update({
      signed_by_directora_id: user.id,
      signed_by_directora_name: user.full_name,
      signed_by_directora_at: new Date().toISOString(),
      status: 'signed',
    })
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: null }
}

export async function sendDischargeToFamily(
  recordId: string,
): Promise<Result<null>> {
  const { user } = await getActor()
  if (!['admin', 'directora', 'recepcion'].includes(user.role)) {
    return { ok: false, error: 'Sin permisos para enviar a la familia.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, child_id')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }
  if (existing.status !== 'signed') {
    return { ok: false, error: 'El alta debe estar firmada por terapista y directora.' }
  }

  const { error } = await admin
    .from('child_discharge_records')
    .update({ status: 'sent_to_family' })
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  // Refrescar vista de la familia
  const { data: childRow } = await admin
    .from('children')
    .select('family_id')
    .eq('id', existing.child_id)
    .maybeSingle()
  if (childRow) {
    revalidatePath(`/familias/${childRow.family_id}/children/${existing.child_id}`)
  }
  revalidatePath('/portal/agenda-digital')
  revalidatePath('/portal/descargas')
  return { ok: true, data: null }
}

export async function getDischargeRecord(
  recordId: string,
): Promise<ChildDischargeRecord | null> {
  const { supabase } = await getActor()
  const { data } = await supabase
    .from('child_discharge_records')
    .select('*')
    .eq('id', recordId)
    .maybeSingle()
  return (data as ChildDischargeRecord | null) ?? null
}

export async function listDischargeRecordsForChild(
  childId: string,
): Promise<ChildDischargeRecord[]> {
  const { supabase } = await getActor()
  const { data } = await supabase
    .from('child_discharge_records')
    .select('*')
    .eq('child_id', childId)
    .order('discharge_date', { ascending: false })
  return (data ?? []) as ChildDischargeRecord[]
}
