'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAdminOrDirectora() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, userId: null }
  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!appUser || (appUser.role !== 'admin' && appUser.role !== 'directora')) {
    return {
      error: 'Solo admins o directora pueden gestionar accesos del portal familia' as const,
      supabase: null,
      userId: null,
    }
  }
  return { error: null, supabase, userId: user.id }
}

export type FamilyUserActionResult = { ok: true; userId?: string } | { ok: false; error: string }

export interface FamilyPortalUser {
  user_id: string
  family_user_id: string
  email: string
  full_name: string
  role: 'owner' | 'viewer'
  can_billing: boolean
  can_work: boolean
  created_at: string
}

/** Lista los usuarios con acceso al portal de una familia. */
export async function listFamilyUsers(familyId: string): Promise<FamilyPortalUser[]> {
  const auth = await requireAdminOrDirectora()
  if (auth.error) throw new Error(auth.error)
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('family_users')
    .select('id, user_id, role, can_billing, can_work, created_at, users:users!inner(id, full_name, email)')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return ((data ?? []) as Array<{
    id: string
    user_id: string
    role: 'owner' | 'viewer'
    can_billing: boolean
    can_work: boolean
    created_at: string
    users: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[]
  }>).map((row) => {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    return {
      user_id: row.user_id,
      family_user_id: row.id,
      email: u?.email ?? '',
      full_name: u?.full_name ?? '',
      role: row.role,
      can_billing: row.can_billing,
      can_work: row.can_work,
      created_at: row.created_at,
    }
  })
}

export interface CreateFamilyUserInput {
  familyId: string
  email: string
  password: string
  fullName?: string
  role?: 'owner' | 'viewer'
  canBilling?: boolean
  canWork?: boolean
}

/**
 * Crea un usuario auth con role='family' y lo vincula a la familia indicada.
 * Si el email ya existe como `family`, lo reusa (actualiza password) y agrega el vínculo.
 */
export async function createFamilyUser(input: CreateFamilyUserInput): Promise<FamilyUserActionResult> {
  try {
    const {
      familyId,
      email,
      password,
      fullName,
      role = 'owner',
      canBilling = true,
      canWork = true,
    } = input

    if (!familyId) return { ok: false, error: 'Falta familyId' }
    if (!canBilling && !canWork) {
      return { ok: false, error: 'Seleccioná al menos un permiso (Facturación o Agenda).' }
    }

    const clean = email.trim().toLowerCase()
    if (!clean || !clean.includes('@')) return { ok: false, error: 'Email inválido' }
    if (!password || password.length < 8) {
      return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
    }

    const auth = await requireAdminOrDirectora()
    if (auth.error) return { ok: false, error: auth.error }

    const admin = createAdminClient()

    // Verificar si ya existe en public.users
    const { data: existing } = await admin
      .from('users')
      .select('id, role')
      .eq('email', clean)
      .maybeSingle()

    let userId: string

    if (existing) {
      if (existing.role !== 'family' && existing.role !== 'client') {
        return {
          ok: false,
          error: `${clean} ya tiene cuenta como ${existing.role}. No se puede reutilizar este correo para una familia.`,
        }
      }
      userId = existing.id

      // Actualiza password (admin puede resetearla)
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password })
      if (updErr) {
        return { ok: false, error: `No se pudo actualizar la contraseña: ${updErr.message}` }
      }

      // Aseguramos role='family' y nombre si lo dio
      const patch: Record<string, unknown> = { role: 'family' }
      if (fullName) patch.full_name = fullName
      await admin.from('users').update(patch).eq('id', userId)
    } else {
      // Limpiar huérfano en auth.users si existe
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orphanId } = await (admin as any).rpc('get_auth_user_id_by_email', {
        p_email: clean,
      }) as { data: string | null }
      if (orphanId) {
        await admin.auth.admin.deleteUser(orphanId).catch((err) =>
          console.error(`[createFamilyUser] No se pudo eliminar auth huérfano ${orphanId}:`, err),
        )
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: clean,
        password,
        email_confirm: true,
        user_metadata: { role: 'family', full_name: fullName ?? null },
      })
      if (error || !data.user) {
        return { ok: false, error: `No se pudo crear el usuario: ${error?.message ?? 'desconocido'}` }
      }
      userId = data.user.id

      // El trigger on_auth_user_created ya inserta en public.users con email.
      // Acá hacemos upsert para asegurar role='family' y full_name.
      const { error: upsertErr } = await admin.from('users').upsert({
        id: userId,
        email: clean,
        full_name: fullName ?? '',
        role: 'family',
      })
      if (upsertErr) {
        await admin.auth.admin.deleteUser(userId).catch(() => undefined)
        return { ok: false, error: `No se pudo registrar el usuario: ${upsertErr.message}` }
      }
    }

    // Vincular a la familia
    const { error: linkErr } = await admin
      .from('family_users')
      .upsert(
        {
          user_id: userId,
          family_id: familyId,
          role,
          can_billing: canBilling,
          can_work: canWork,
        },
        { onConflict: 'user_id,family_id' },
      )
    if (linkErr) return { ok: false, error: `No se pudo vincular a la familia: ${linkErr.message}` }

    revalidatePath(`/familias/${familyId}`)
    return { ok: true, userId }
  } catch (e) {
    console.error('[createFamilyUser]', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado al crear el acceso.' }
  }
}

/**
 * Actualiza permisos de un vínculo existente sin tocar la cuenta auth.
 */
export async function updateFamilyUserPermissions(input: {
  familyId: string
  userId: string
  role: 'owner' | 'viewer'
  canBilling: boolean
  canWork: boolean
}): Promise<FamilyUserActionResult> {
  try {
    if (!input.canBilling && !input.canWork) {
      return { ok: false, error: 'Seleccioná al menos un permiso.' }
    }
    const auth = await requireAdminOrDirectora()
    if (auth.error) return { ok: false, error: auth.error }
    const admin = createAdminClient()

    const { error } = await admin
      .from('family_users')
      .update({
        role: input.role,
        can_billing: input.canBilling,
        can_work: input.canWork,
      })
      .eq('family_id', input.familyId)
      .eq('user_id', input.userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath(`/familias/${input.familyId}`)
    return { ok: true, userId: input.userId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado.' }
  }
}

/**
 * Revoca el acceso al portal: desvincula al usuario de la familia. Si era su
 * único vínculo (no está en otras familias), borra también auth + public.users.
 */
export async function revokeFamilyUser(input: {
  familyId: string
  userId: string
}): Promise<FamilyUserActionResult> {
  try {
    const auth = await requireAdminOrDirectora()
    if (auth.error) return { ok: false, error: auth.error }
    const admin = createAdminClient()

    const { data: target } = await admin
      .from('users')
      .select('role')
      .eq('id', input.userId)
      .maybeSingle()
    if (!target) return { ok: false, error: 'Usuario no encontrado.' }
    if (target.role !== 'family' && target.role !== 'client') {
      return { ok: false, error: 'Solo se pueden revocar accesos de tipo familia.' }
    }

    const { error: unlinkErr } = await admin
      .from('family_users')
      .delete()
      .eq('family_id', input.familyId)
      .eq('user_id', input.userId)
    if (unlinkErr) return { ok: false, error: `No se pudo desvincular: ${unlinkErr.message}` }

    // ¿Tiene otros vínculos? Si no, eliminar la cuenta completamente.
    const { data: remaining } = await admin
      .from('family_users')
      .select('id')
      .eq('user_id', input.userId)
      .limit(1)

    if (!remaining || remaining.length === 0) {
      await admin.from('users').delete().eq('id', input.userId)
      await admin.auth.admin.deleteUser(input.userId).catch((err) =>
        console.error(`[revokeFamilyUser] no se pudo borrar auth ${input.userId}:`, err),
      )
    }

    revalidatePath(`/familias/${input.familyId}`)
    return { ok: true, userId: input.userId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado.' }
  }
}
