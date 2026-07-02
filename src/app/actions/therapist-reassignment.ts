'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { TreatmentPlan, TreatmentPlanTherapyEntry, UserRole } from '@/types/db'

// Quién puede reasignar en bloque (sustituir una terapeuta por otra).
const MGMT_ROLES: UserRole[] = ['admin', 'directora', 'coordinadora_terapias', 'recepcion']

// Roles que pueden recibir terapias (candidatos destino de una sustitución).
const THERAPY_CAPABLE_ROLES: UserRole[] = [
  'terapista',
  'maestra',
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
]

async function getActor() {
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { role: ctx.appUser.role as UserRole, id: ctx.appUser.id }
}

/** Candidatos destino para una sustitución (excluye al usuario origen). */
export async function listReassignTargets(
  excludeUserId: string,
): Promise<{ id: string; full_name: string; role: UserRole }[]> {
  const actor = await getActor()
  if (!MGMT_ROLES.includes(actor.role)) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, full_name, role')
    .in('role', THERAPY_CAPABLE_ROLES)
    .neq('id', excludeUserId)
    .order('full_name', { ascending: true })
  return (data ?? []) as { id: string; full_name: string; role: UserRole }[]
}

/**
 * Sustituye a una terapeuta por otra: redirige TODAS sus terapias a otra persona
 * sin borrar el perfil. Actualiza (a) la asignación por servicio en los planes
 * activos (therapies_json[].therapist_id) y la terapeuta principal derivada
 * (primary_therapist_id), y (b) las citas FUTURAS 'scheduled'/'replacement'/
 * 'in_progress'. Las citas pasadas/completadas se conservan con la terapeuta
 * original (histórico). Escritura privilegiada por admin client, gateada por rol.
 */
export async function reassignAllFromTherapist(
  fromTherapistId: string,
  toTherapistId: string,
): Promise<
  | { ok: true; plansUpdated: number; appointmentsUpdated: number }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!MGMT_ROLES.includes(actor.role)) {
    return { ok: false, error: 'Sin permisos para sustituir terapeutas.' }
  }
  if (!fromTherapistId || !toTherapistId) {
    return { ok: false, error: 'Falta la terapeuta origen o destino.' }
  }
  if (fromTherapistId === toTherapistId) {
    return { ok: false, error: 'La terapeuta destino debe ser distinta.' }
  }

  const admin = createAdminClient()

  // Validar que ambas personas existan.
  const { data: usersRows } = await admin
    .from('users')
    .select('id')
    .in('id', [fromTherapistId, toTherapistId])
  const found = new Set((usersRows ?? []).map((u) => u.id))
  if (!found.has(fromTherapistId) || !found.has(toTherapistId)) {
    return { ok: false, error: 'Terapeuta origen o destino no encontrada.' }
  }

  // 1) Planes activos: remapear therapist_id por servicio + primary derivada.
  const { data: plansRaw } = await admin
    .from('treatment_plans')
    .select('*')
    .eq('active', true)
  const plans = (plansRaw ?? []) as TreatmentPlan[]

  let plansUpdated = 0
  for (const plan of plans) {
    const therapies = (plan.therapies_json ?? []) as TreatmentPlanTherapyEntry[]
    let changed = false
    const newTherapies = therapies.map((t) => {
      if (t.therapist_id === fromTherapistId) {
        changed = true
        return { ...t, therapist_id: toTherapistId }
      }
      return t
    })
    const newPrimary =
      plan.primary_therapist_id === fromTherapistId ? toTherapistId : plan.primary_therapist_id
    if (plan.primary_therapist_id === fromTherapistId) changed = true

    if (changed) {
      const { error } = await admin
        .from('treatment_plans')
        .update({ therapies_json: newTherapies, primary_therapist_id: newPrimary })
        .eq('id', plan.id)
      if (!error) plansUpdated += 1
    }
  }

  // 2) Citas futuras activas → nueva terapeuta.
  const nowIso = new Date().toISOString()
  const { data: apptRows, error: apptErr } = await admin
    .from('appointments')
    .update({ therapist_id: toTherapistId })
    .eq('therapist_id', fromTherapistId)
    .gte('starts_at', nowIso)
    .in('status', ['scheduled', 'replacement', 'in_progress'])
    .select('id')
  if (apptErr) return { ok: false, error: apptErr.message }
  const appointmentsUpdated = apptRows?.length ?? 0

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  revalidatePath('/familias')
  revalidatePath('/users')
  return { ok: true, plansUpdated, appointmentsUpdated }
}
