'use server'

import { createClient } from '@/lib/supabase/server'
import { assertNotImpersonating } from './impersonation'
import type { PresenceStatus } from '@/types/db'

const VALID: readonly PresenceStatus[] = ['online', 'away', 'almuerzo']

/**
 * Setea el estado manual del usuario actual. El estado "en llamada" no se
 * guarda — se deriva client-side cruzando call_participants activos.
 */
export async function setPresenceStatus(status: PresenceStatus) {
  try {
    await assertNotImpersonating()
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    if (!VALID.includes(status)) {
      return { error: 'Estado inválido' }
    }

    // Upsert — primera vez que el user toca presence se inserta el row.
    const { error } = await supabase
      .from('user_presence')
      .upsert(
        { user_id: user.id, status },
        { onConflict: 'user_id' }
      )

    if (error) return { error: error.message }
    return { ok: true }
  } catch (e) {
    console.error('setPresenceStatus failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
