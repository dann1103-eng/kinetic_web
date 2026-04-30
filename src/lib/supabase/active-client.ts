// Testing strategy: cubierto por el flujo end-to-end en Task 10 (no unit test).
// Mockear cookies() + Supabase introduce más fragilidad que valor.

import { cookies } from 'next/headers'
import { createClient } from './server'
import { createAdminClient } from './admin'
import { IMPERSONATE_COOKIE } from '@/lib/auth/effective-user'

export const ACTIVE_CLIENT_COOKIE = 'portal_active_client'

/** Devuelve todos los client_id vinculados al user efectivo (real o suplantado). */
export async function getActiveClientIds(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Si admin está suplantando a un cliente, leer los client_id del impersonado
  // (vía admin client para bypass RLS).
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
  if (impersonateId && impersonateId !== user.id) {
    const { data: realUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (realUser?.role === 'admin') {
      const admin = createAdminClient()
      const { data } = await admin
        .from('client_users')
        .select('client_id')
        .eq('user_id', impersonateId)
      return (data ?? []).map((r) => r.client_id)
    }
  }

  const { data, error } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('user_id', user.id)

  if (error || !data) return []
  return data.map((r) => r.client_id)
}

/**
 * Resuelve el client_id activo leyendo la cookie; si la cookie no está o
 * apunta a un client_id fuera de la lista del user, devuelve null.
 * Los server components deben redirigir a /portal/seleccionar-marca cuando
 * esta función retorna null pero getActiveClientIds() tiene al menos uno.
 */
export async function getActiveClientId(): Promise<string | null> {
  const ids = await getActiveClientIds()
  if (ids.length === 0) return null

  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(ACTIVE_CLIENT_COOKIE)?.value

  if (fromCookie && ids.includes(fromCookie)) return fromCookie
  if (ids.length === 1) return ids[0]

  return null
}
