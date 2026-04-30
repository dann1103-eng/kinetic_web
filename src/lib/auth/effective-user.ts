import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AppUser } from '@/types/db'

export const IMPERSONATE_COOKIE = 'fm_impersonate_user_id'

export interface EffectiveUserContext {
  /** ID del usuario realmente autenticado (auth.uid()). Nunca cambia con la suplantación. */
  authUser: { id: string }
  /** El usuario "efectivo" que la UI debe mostrar (suplantado o real). */
  appUser: AppUser
  /** El usuario admin real, útil para banner y para checks de permisos. */
  realAppUser: AppUser
  /** True solo si la suplantación está activa Y el real es admin. */
  isImpersonating: boolean
}

/**
 * Resuelve el usuario "efectivo" leyendo la cookie httpOnly de suplantación.
 *
 * Reglas:
 * - Si no hay sesión → null (caller debe redirect /login).
 * - Si no hay cookie de suplantación → real.
 * - Si hay cookie, el real es admin, y el target existe y NO es otro admin →
 *   retorna el target como appUser.
 * - En cualquier otro caso (cookie set pero el real no es admin, o intento
 *   de suplantar a admin) → ignora la cookie y retorna el real.
 *
 * Las queries de páginas que filtran por user.id deben usar `appUser.id` (el
 * efectivo). Las server actions de mutación deben verificar
 * `assertNotImpersonating()` antes de continuar.
 */
export async function getEffectiveUser(): Promise<EffectiveUserContext | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: realAppUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()
  if (!realAppUser) return null

  const cookieStore = await cookies()
  const targetId = cookieStore.get(IMPERSONATE_COOKIE)?.value

  if (
    targetId &&
    realAppUser.role === 'admin' &&
    targetId !== authUser.id
  ) {
    const admin = createAdminClient()
    const { data: targetUser } = await admin
      .from('users')
      .select('*')
      .eq('id', targetId)
      .single()
    if (targetUser && targetUser.role !== 'admin') {
      return {
        authUser: { id: authUser.id },
        appUser: targetUser as AppUser,
        realAppUser: realAppUser as AppUser,
        isImpersonating: true,
      }
    }
  }

  return {
    authUser: { id: authUser.id },
    appUser: realAppUser as AppUser,
    realAppUser: realAppUser as AppUser,
    isImpersonating: false,
  }
}
