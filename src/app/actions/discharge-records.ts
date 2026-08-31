'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { calculateDischargeStats } from '@/lib/domain/intake-pipeline'
import { advanceChildPhase } from './intake-pipeline'
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

// Roles que pueden finalizar la baja SIN la firma bloqueante de directora, y
// por lo tanto también editar un registro ya firmado y enviarlo a la familia
// (paridad: quien puede cerrar el registro solo, puede corregirlo y enviarlo
// solo). Ver comentario extendido junto a `finalizeDischarge`.
const CAN_FINALIZE_DISCHARGE: UserRole[] = ['admin', 'directora', 'coordinadora_terapias']

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

  if (existing.status !== 'draft' && !CAN_FINALIZE_DISCHARGE.includes(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora de terapias puede editar un alta ya firmada.' }
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

  // Validar que el actor es una terapista asignada del niño (o admin/directora).
  // Ya no hay terapista principal: cualquier terapista con una terapia asignada
  // en el plan activo del niño puede firmar.
  if (!['admin', 'directora'].includes(user.role)) {
    const { data: plan } = await admin
      .from('treatment_plans')
      .select('therapies_json')
      .eq('child_id', existing.child_id)
      .eq('active', true)
      .maybeSingle()
    const planRow = plan as {
      therapies_json: Array<{ therapist_id?: string | null; active?: boolean }> | null
    } | null
    const isAssigned = (planRow?.therapies_json ?? []).some(
      (t) => t.therapist_id === user.id && t.active !== false,
    )
    if (!isAssigned) {
      return { ok: false, error: 'Solo una terapista asignada del niño/a puede firmar.' }
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

/**
 * Finaliza la baja: firma el registro Y deja al niño en su fase terminal.
 *
 * **El cambio de fase va acá, no al enviar el documento a la familia.** Antes
 * colgaba de "Enviar a familia", el último de tres pasos, así que una baja
 * firmada y no enviada dejaba al niño en "Activo en Terapias" para todo el
 * resto del sistema — la agenda, /ninos, /mis-ninos y los dashboards leen
 * `current_phase_code`. La coordinadora daba el retiro por hecho y a los demás
 * les seguía apareciendo activo (caso reportado el 31-ago-2026).
 *
 * Firmar ES la decisión; mandarle el documento a la familia es logística
 * posterior. Es además lo que pidió dirección: "una vez Diana lo cambie de fase
 * se efectúe sin mi aprobación; a mí solo se me notifica" — la notificación la
 * sigue disparando `advanceChildPhase`.
 *
 * Sin la firma bloqueante de directora: la coordinadora de terapias (y admin)
 * cierran el registro solas (`CAN_FINALIZE_DISCHARGE`, mig 0174).
 */
export async function finalizeDischarge(recordId: string): Promise<Result<null>> {
  const { user } = await getActor()
  if (!CAN_FINALIZE_DISCHARGE.includes(user.role)) {
    return { ok: false, error: 'Sin permisos para finalizar la baja.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, child_id, discharge_type')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }
  if (existing.status !== 'draft') {
    return { ok: false, error: 'Solo se puede finalizar un borrador.' }
  }

  // La firma de quien finaliza queda estampada: coordinadora_terapias en sus
  // columnas propias (mig 0174 — es la única firma requerida para dar de alta),
  // directora/admin en las de directora. Antes la coordinadora cerraba la baja
  // sin dejar constancia y el registro/PDF quedaban con "Sin firma".
  const update: Partial<Omit<ChildDischargeRecord, 'id' | 'created_at'>> = { status: 'signed' }
  if (user.role === 'coordinadora_terapias') {
    update.signed_by_coordinadora_id = user.id
    update.signed_by_coordinadora_name = user.full_name
    update.signed_by_coordinadora_at = new Date().toISOString()
  } else if (['admin', 'directora'].includes(user.role)) {
    update.signed_by_directora_id = user.id
    update.signed_by_directora_name = user.full_name
    update.signed_by_directora_at = new Date().toISOString()
  }

  const { error } = await admin
    .from('child_discharge_records')
    .update(update)
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  // Y el niño queda efectivamente dado de alta / retirado. Si esto fallara, la
  // firma ya quedó guardada y `finalizeDischarge` no se puede reintentar (exige
  // borrador), así que el error tiene que decir exactamente qué pasó y qué
  // falta, en vez de dejar la baja a medias en silencio.
  const targetCode =
    (existing as { discharge_type?: DischargeType }).discharge_type === 'alta'
      ? '5_1_alta_terapeutica'
      : '5_2_retirado'
  const advanced = await advanceChildPhase(
    (existing as { child_id: string }).child_id,
    targetCode,
    'Cierre firmado.',
    { confirmCancelAppointments: true },
  )
  if (!advanced.ok) {
    return {
      ok: false,
      error: `La baja quedó firmada, pero el niño/a NO cambió de fase: ${advanced.error} Cambiala a mano desde la ficha, o el resto del equipo lo va a seguir viendo activo.`,
    }
  }

  return { ok: true, data: null }
}

export async function sendDischargeToFamily(
  recordId: string,
): Promise<Result<null>> {
  const { user } = await getActor()
  // coordinadora_terapias puede finalizar la baja sola (CAN_FINALIZE_DISCHARGE)
  // — debe poder enviarla también, sin depender de recepción/directora.
  if (!['admin', 'directora', 'recepcion', 'coordinadora_terapias'].includes(user.role)) {
    return { ok: false, error: 'Sin permisos para enviar a la familia.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('child_discharge_records')
    .select('id, status, child_id, discharge_type')
    .eq('id', recordId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Registro no encontrado.' }
  if (existing.status !== 'signed') {
    return { ok: false, error: 'El alta debe estar firmada por la coordinadora de terapias primero.' }
  }

  const { error } = await admin
    .from('child_discharge_records')
    .update({ status: 'sent_to_family' })
    .eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  // Red de seguridad para las bajas FIRMADAS ANTES de que el cambio de fase se
  // moviera a `finalizeDischarge` (31-ago-2026): esas quedaron con el niño
  // activo, y sin esto no tendrían ningún camino para retirarse — el desplegable
  // de fase abre este mismo formulario, y finalizeDischarge exige un borrador.
  // Si la fase ya es la terminal no se toca: volver a avanzar desde una fase
  // terminal solo lo permite admin/directora y le daría un error inútil a la
  // coordinadora.
  const { data: childRow } = await admin
    .from('children')
    .select('family_id, current_phase_code')
    .eq('id', existing.child_id)
    .maybeSingle()

  const targetCode =
    (existing as { discharge_type?: DischargeType }).discharge_type === 'alta'
      ? '5_1_alta_terapeutica'
      : '5_2_retirado'
  if (childRow && (childRow as { current_phase_code?: string }).current_phase_code !== targetCode) {
    const advanced = await advanceChildPhase(existing.child_id, targetCode, 'Cierre enviado a la familia.', {
      confirmCancelAppointments: true,
    })
    if (!advanced.ok) {
      console.error(
        `[sendDischargeToFamily] ${recordId}: enviado, pero el niño ${existing.child_id} no cambió de fase: ${advanced.error}`,
      )
    }
  }

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
