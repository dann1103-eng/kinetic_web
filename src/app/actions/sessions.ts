'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * Reclama una nueva sesión para el usuario actual.
 * Genera un UUID, lo guarda en `users.current_session_id` y lo retorna.
 * El cliente lo persiste en `localStorage['fm_session_id']`. Cualquier otro
 * dispositivo del mismo usuario detectará el cambio vía realtime y se
 * auto-deslogueará (ver SessionSentinel).
 */
export async function claimSession(): Promise<
  { ok: true; sessionId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const sessionId = randomUUID()
  const { error } = await supabase
    .from('users')
    .update({ current_session_id: sessionId })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return { ok: true, sessionId }
}

/**
 * Verifica si el `localSessionId` que tiene el cliente coincide con el
 * `current_session_id` actual en la BD. Usado como fallback cuando realtime
 * está caído (polling cada 30s + on visibilitychange).
 */
export async function verifySession(
  localSessionId: string,
): Promise<{ valid: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { valid: false }

  const { data } = await supabase
    .from('users')
    .select('current_session_id')
    .eq('id', user.id)
    .maybeSingle()

  return { valid: data?.current_session_id === localSessionId }
}
