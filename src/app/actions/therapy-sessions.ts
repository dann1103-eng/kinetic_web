'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { TherapySession } from '@/types/db'

/**
 * Resuelve el usuario efectivo (respeta impersonación: si admin impersona a
 * terapista, las acciones se ejecutan como la terapista). RLS para INSERT/UPDATE
 * requiere `therapist_id = auth.uid() OR is_admin()` — durante impersonación,
 * el admin real cumple `is_admin()` así que las inserciones pasan aunque el
 * therapist_id sea el de la impersonada.
 */
async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, actorId: ctx.appUser.id, actorRole: ctx.appUser.role }
}

/** Roles de gestión que pueden reanudar / marcar incompleta la sesión de otra terapista. */
const SESSION_OVERRIDE_ROLES = ['admin', 'directora', 'coordinadora_terapias']

export async function startTherapySession(appointmentId: string): Promise<
  | { ok: true; session: TherapySession }
  | { ok: false; error: string }
> {
  const { supabase, actorId } = await getActor()

  const { data, error } = await supabase.rpc('start_therapy_session', {
    p_appointment_id: appointmentId,
    p_therapist_id: actorId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('appointment_not_found_or_not_eligible')) {
      return {
        ok: false,
        error:
          'Esta cita ya no está disponible para iniciar (pudo reagendarse, ' +
          'duplicarse o cambiar de terapeuta). Actualizamos tu día — revisá e intentá de nuevo.',
      }
    }
    if (msg.includes('unique') || msg.includes('23505')) {
      return { ok: false, error: 'La sesión ya fue iniciada.' }
    }
    return { ok: false, error: 'Error al iniciar la sesión.' }
  }

  revalidatePath('/mi-dia')
  return { ok: true, session: data as TherapySession }
}

export async function finishTherapySession(sessionId: string): Promise<
  | { ok: true; session: TherapySession; alreadyFinished?: boolean }
  | { ok: false; error: string }
> {
  const { supabase, actorId } = await getActor()

  const { data, error } = await supabase.rpc('finish_therapy_session', {
    p_session_id: sessionId,
    p_therapist_id: actorId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('session_not_found')) {
      return { ok: false, error: 'Sesión no encontrada.' }
    }
    if (msg.includes('not_authorized')) {
      return { ok: false, error: 'No autorizado.' }
    }
    return { ok: false, error: 'Error al finalizar la sesión.' }
  }

  const session = data as TherapySession
  const alreadyFinished = session.ended_at !== null && session.status === 'completed'

  // Marcar el momento de finalización (inicio del timer de despacho/recogida tardía).
  // La RPC no setea completed_at; lo hacemos acá para que "Despachar niño/a" y el
  // watcher de despachos funcionen. Idempotente: solo si está null.
  if (session?.appointment_id) {
    await createAdminClient()
      .from('appointments')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', session.appointment_id)
      .is('completed_at', null)
  }

  revalidatePath('/mi-dia')
  return { ok: true, session, alreadyFinished }
}

/**
 * Completa directamente una cita sin niño/a registrado/a (evaluaciones,
 * entrevistas, reuniones, etc.). Estas citas tienen child_id=null y no pueden
 * pasar por el flujo start_therapy_session → finish_therapy_session porque
 * therapy_sessions.child_id es NOT NULL.
 */
export async function completeFreePerson(appointmentId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { supabase, actorId } = await getActor()

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, therapist_id, assignee_ids, status')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.child_id) {
    return { ok: false, error: 'Esta cita tiene niño/a registrado/a.' }
  }
  if (!['scheduled', 'in_progress'].includes(appt.status)) {
    return { ok: false, error: 'La cita no está en estado válido para completar.' }
  }

  const assigneeIds = (appt.assignee_ids ?? []) as string[]
  const isAssigned = appt.therapist_id === actorId || assigneeIds.includes(actorId)
  if (!isAssigned) {
    return { ok: false, error: 'Sin permisos para completar esta cita.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('appointments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', appointmentId)

  if (error) return { ok: false, error: 'Error al completar la cita.' }

  revalidatePath('/mi-dia')
  return { ok: true }
}

/**
 * Reanuda una sesión finalizada por error: therapy_sessions vuelve a 'active'
 * (ended_at=null) y la cita a 'in_progress' (completed_at=null, para apagar el
 * timer de despacho). Solo si el niño NO fue despachado/entregado todavía.
 *
 * Escrituras vía admin client gateadas por rol en código (patrón del repo);
 * puede hacerlo la terapista dueña de la sesión o gestión (admin/directora/
 * coordinadora_terapias).
 */
export async function resumeTherapySession(sessionId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { actorId, actorRole } = await getActor()
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('therapy_sessions')
    .select('id, appointment_id, therapist_id, status, ended_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Sesión no encontrada.' }

  const canOverride = SESSION_OVERRIDE_ROLES.includes(actorRole)
  if (session.therapist_id !== actorId && !canOverride) {
    return { ok: false, error: 'Sin permisos para reanudar esta sesión.' }
  }
  if (session.status !== 'completed' && !session.ended_at) {
    return { ok: false, error: 'La sesión no está finalizada.' }
  }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, status, dispatched_at, handed_to_reception_at')
    .eq('id', session.appointment_id)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.dispatched_at || appt.handed_to_reception_at) {
    return {
      ok: false,
      error: 'El niño/a ya fue entregado/despachado — no se puede reanudar la sesión.',
    }
  }
  if (appt.status !== 'completed') {
    return { ok: false, error: 'La cita no está en estado completada.' }
  }

  const { error: sessErr } = await admin
    .from('therapy_sessions')
    .update({ status: 'active', ended_at: null })
    .eq('id', sessionId)
  if (sessErr) return { ok: false, error: sessErr.message }

  const { error: apptErr } = await admin
    .from('appointments')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', session.appointment_id)
  if (apptErr) return { ok: false, error: apptErr.message }

  revalidatePath('/mi-dia')
  return { ok: true }
}

/**
 * Reposición de emergencia: la sesión se inició pero el niño/a salió a mitad
 * (no cooperó / emergencia) y no se pudo dar la terapia. Marca la cita como
 * NO completada (no cuenta para cobro por terapia ni asistencia) y crea la
 * solicitud de reposición pendiente para que la coordinadora la reagende —
 * igual que una inasistencia normal, pero utilizable incluso después de haber
 * presionado "Finalizar".
 */
export async function emergencyIncomplete(
  appointmentId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { actorId, actorRole } = await getActor()
  const admin = createAdminClient()

  const { data: appt } = await admin
    .from('appointments')
    .select('id, child_id, therapist_id, status, dispatched_at, handed_to_reception_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (!appt.child_id) {
    return { ok: false, error: 'Esta cita no tiene niño/a registrado/a.' }
  }
  if (!['in_progress', 'completed'].includes(appt.status)) {
    return { ok: false, error: 'La cita no está en un estado válido para reposición de emergencia.' }
  }
  if (appt.dispatched_at || appt.handed_to_reception_at) {
    return { ok: false, error: 'El niño/a ya fue entregado/despachado — usá la inasistencia normal con la coordinadora.' }
  }

  const canOverride = SESSION_OVERRIDE_ROLES.includes(actorRole)
  if (appt.therapist_id !== actorId && !canOverride) {
    return { ok: false, error: 'Sin permisos sobre esta cita.' }
  }

  const now = new Date().toISOString()
  const trimmedReason = reason?.trim() || 'Reposición de emergencia — la sesión se inició pero no pudo completarse'

  // 1) Cerrar la sesión activa (si existe) para no dejarla huérfana con el
  //    cronómetro corriendo.
  await admin
    .from('therapy_sessions')
    .update({ status: 'completed', ended_at: now })
    .eq('appointment_id', appointmentId)
    .is('ended_at', null)

  // 2) La cita deja de contar como completada (cobro por terapia / asistencia).
  const { error: apptErr } = await admin
    .from('appointments')
    .update({ status: 'no_show', completed_at: null })
    .eq('id', appointmentId)
  if (apptErr) return { ok: false, error: apptErr.message }

  // 3) Solicitud de reposición pendiente (upsert manual: si ya existía una
  //    absence para esta cita, se reabre — espejo del ON CONFLICT de la RPC
  //    mark_appointment_absence).
  const { data: existingAbs } = await admin
    .from('appointment_absences')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()
  if (existingAbs) {
    const { error: absErr } = await admin
      .from('appointment_absences')
      .update({
        status: 'pending',
        reported_at: now,
        reported_by_user_id: actorId,
        reason: trimmedReason,
        resolved_at: null,
        resolved_by_user_id: null,
        replacement_appointment_id: null,
        waive_reason: null,
      })
      .eq('id', existingAbs.id)
    if (absErr) return { ok: false, error: absErr.message }
  } else {
    const { error: absErr } = await admin.from('appointment_absences').insert({
      appointment_id: appointmentId,
      child_id: appt.child_id,
      therapist_id: appt.therapist_id,
      reported_by_user_id: actorId,
      reason: trimmedReason,
      status: 'pending',
    })
    if (absErr) return { ok: false, error: absErr.message }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  revalidatePath('/agenda')
  return { ok: true }
}
