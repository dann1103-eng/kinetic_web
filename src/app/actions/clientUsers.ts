'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, adminUserId: null }
  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (appUser?.role !== 'admin') {
    return { error: 'Solo admins pueden gestionar accesos de portal' as const, supabase: null, adminUserId: null }
  }
  return { error: null, supabase, adminUserId: user.id }
}

export type ClientUserActionResult = { ok: true; userId?: string } | { ok: false; error: string }

export async function createClientUser(params: {
  clientId: string
  email: string
  password: string
  fullName?: string
}): Promise<ClientUserActionResult> {
  try {
    const { clientId, email, password, fullName } = params
    const clean = email.trim().toLowerCase()
    if (!clean || !clean.includes('@')) return { ok: false, error: 'Email inválido' }
    if (!password || password.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }

    const auth = await requireAdmin()
    if (auth.error) return { ok: false, error: auth.error }

    const admin = createAdminClient()

    const { data: existing } = await admin
      .from('users')
      .select('id, role')
      .eq('email', clean)
      .maybeSingle()

    let userId: string

    if (existing) {
      if (existing.role !== 'client') {
        return {
          ok: false,
          error: `${clean} ya tiene cuenta como ${existing.role}. No se puede reutilizar este correo para un cliente.`,
        }
      }
      userId = existing.id
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password })
      if (updErr) return { ok: false, error: `No se pudo actualizar la contraseña: ${updErr.message}` }
      if (fullName) {
        await admin.from('users').update({ full_name: fullName }).eq('id', userId)
      }
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: clean,
        password,
        email_confirm: true,
        user_metadata: { role: 'client', full_name: fullName ?? null },
      })
      if (error || !data.user) {
        return { ok: false, error: `No se pudo crear el usuario: ${error?.message ?? 'desconocido'}` }
      }
      userId = data.user.id

      const { error: upsertErr } = await admin.from('users').upsert({
        id: userId,
        email: clean,
        full_name: fullName ?? '',
        role: 'client',
      })
      if (upsertErr) {
        await admin.auth.admin.deleteUser(userId).catch(() => undefined)
        return { ok: false, error: `No se pudo registrar el usuario: ${upsertErr.message}` }
      }
    }

    const { error: linkErr } = await admin
      .from('client_users')
      .upsert(
        { user_id: userId, client_id: clientId, role: 'owner' },
        { onConflict: 'user_id,client_id' }
      )
    if (linkErr) return { ok: false, error: `No se pudo vincular al cliente: ${linkErr.message}` }

    revalidatePath(`/clients/${clientId}`)
    return { ok: true, userId }
  } catch (e) {
    console.error('[createClientUser]', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado al crear credenciales' }
  }
}

export async function revokeClientUser(params: {
  clientId: string
  userId: string
}): Promise<ClientUserActionResult> {
  try {
    const auth = await requireAdmin()
    if (auth.error) return { ok: false, error: auth.error }

    const admin = createAdminClient()

    const { data: target } = await admin
      .from('users')
      .select('role')
      .eq('id', params.userId)
      .maybeSingle()
    if (!target) return { ok: false, error: 'Usuario no encontrado' }
    if (target.role !== 'client') {
      return { ok: false, error: 'Solo se pueden revocar accesos de clientes' }
    }

    const { error: unlinkErr } = await admin
      .from('client_users')
      .delete()
      .eq('client_id', params.clientId)
      .eq('user_id', params.userId)
    if (unlinkErr) return { ok: false, error: `No se pudo desvincular del cliente: ${unlinkErr.message}` }

    const { data: remaining } = await admin
      .from('client_users')
      .select('id')
      .eq('user_id', params.userId)
      .limit(1)

    if (!remaining || remaining.length === 0) {
      const { error: delPubErr } = await admin.from('users').delete().eq('id', params.userId)
      if (delPubErr) return { ok: false, error: `No se pudo eliminar el registro público: ${delPubErr.message}` }

      const { error: delAuthErr } = await admin.auth.admin.deleteUser(params.userId)
      if (delAuthErr) return { ok: false, error: `No se pudo eliminar la cuenta: ${delAuthErr.message}` }
    }

    revalidatePath(`/clients/${params.clientId}`)
    return { ok: true }
  } catch (e) {
    console.error('[revokeClientUser]', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado al revocar acceso' }
  }
}

export async function listClientUsers(clientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_users')
    .select('id, user_id, role, created_at, users:users!inner(id, full_name, email, role)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
