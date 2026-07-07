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
  return { supabase, actorId: ctx.appUser.id }
}

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
