'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
      return { ok: false, error: 'La cita no está disponible para iniciar.' }
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

  revalidatePath('/mi-dia')
  return { ok: true, session, alreadyFinished }
}
