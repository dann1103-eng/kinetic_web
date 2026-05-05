'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_CLIENT_COOKIE } from '@/lib/supabase/active-client'
import { IMPERSONATE_COOKIE } from '@/lib/auth/effective-user'

export async function setActiveClient(clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Si el admin está impersonando, validar con el ID del usuario suplantado
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
  const effectiveUserId = (impersonateId && impersonateId !== user.id) ? impersonateId : user.id

  const queryClient = effectiveUserId !== user.id ? createAdminClient() : supabase
  const { data } = await queryClient
    .from('client_users')
    .select('client_id')
    .eq('user_id', effectiveUserId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!data) throw new Error('No tienes acceso a esa marca')

  cookieStore.set(ACTIVE_CLIENT_COOKIE, clientId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/portal', 'layout')
}
