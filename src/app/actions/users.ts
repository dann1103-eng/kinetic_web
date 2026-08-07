'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAN_MANAGE_USERS_ROLES, type UserRole } from '@/types/db'

/** Verifica que el actor pueda gestionar usuarios y devuelve su rol. */
async function requireUserManager(): Promise<UserRole> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!data || !CAN_MANAGE_USERS_ROLES.includes(data.role)) throw new Error('Sin permisos')
  return data.role as UserRole
}

export async function createUser(payload: {
  email: string
  password: string
  fullName: string
  role: UserRole
}) {
  try {
    const actorRole = await requireUserManager()
    // Anti-escalada: solo un admin puede crear otro admin.
    if (payload.role === 'admin' && actorRole !== 'admin') {
      return { error: 'Solo un admin puede crear cuentas con rol admin.' }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno.' }
    }

    const admin = createAdminClient()

    const { data, error } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName },
    })

    if (error) return { error: error.message }
    if (!data.user) return { error: 'No se recibió el usuario creado.' }

    // El trigger on_auth_user_created ya insertó (id, email) con rol por defecto
    // 'operator'. Acá fijamos el rol/nombre reales. Si esto falla, revertimos
    // borrando el usuario de auth para NO dejar una cuenta a medias (que luego
    // bloquearía recrearla por "email ya existe").
    const { error: insertError } = await admin.from('users').upsert({
      id: data.user.id,
      email: payload.email,
      full_name: payload.fullName,
      role: payload.role,
    })

    if (insertError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
      return { error: `No se pudo guardar el perfil del usuario: ${insertError.message}` }
    }

    revalidatePath('/users')
    return { success: true }
  } catch (e) {
    console.error('createUser failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido al crear usuario' }
  }
}

export async function updateUserProfile(payload: {
  userId: string
  fullName?: string
  avatarUrl?: string | null
  email?: string
}) {
  try {
    await requireUserManager()

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno.' }
    }

    const admin = createAdminClient()

    const profileUpdate: { full_name?: string; avatar_url?: string | null; email?: string } = {}
    if (payload.fullName !== undefined) profileUpdate.full_name = payload.fullName
    if (payload.avatarUrl !== undefined) profileUpdate.avatar_url = payload.avatarUrl
    if (payload.email !== undefined) profileUpdate.email = payload.email

    if (Object.keys(profileUpdate).length === 0) {
      return { error: 'Sin cambios para guardar.' }
    }

    if (payload.email !== undefined) {
      const { error: authError } = await admin.auth.admin.updateUserById(payload.userId, {
        email: payload.email,
      })
      if (authError) return { error: authError.message }
    }

    if (payload.fullName !== undefined) {
      await admin.auth.admin.updateUserById(payload.userId, {
        user_metadata: { full_name: payload.fullName },
      })
    }

    const { error } = await admin.from('users').update(profileUpdate).eq('id', payload.userId)
    if (error) return { error: error.message }

    revalidatePath('/users')
    return { success: true }
  } catch (e) {
    console.error('updateUserProfile failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido al actualizar perfil' }
  }
}

const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * Sube la foto de perfil de OTRO usuario (personal interno). Gateada por
 * requireUserManager(); escribe con admin client, que evade el RLS del bucket
 * user-avatars (restringido a la carpeta propia auth.uid()). Devuelve la URL
 * pública y la guarda en users.avatar_url.
 */
export async function uploadUserAvatarFor(userId: string, formData: FormData) {
  try {
    await requireUserManager()

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno.' }
    }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'No se recibió ningún archivo.' }
    }
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      return { error: 'Formato no permitido. Usá PNG, JPG o WebP.' }
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return { error: 'El archivo supera el límite de 2 MB.' }
    }

    const admin = createAdminClient()

    // Verificar que el objetivo es personal interno (no una cuenta family/client).
    const { data: target } = await admin.from('users').select('role').eq('id', userId).single()
    if (!target) return { error: 'Usuario no encontrado.' }
    if (target.role === 'family' || target.role === 'client') {
      return { error: 'Esta acción es solo para personal interno.' }
    }

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${userId}/avatar.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from('user-avatars')
      .upload(path, buffer, { upsert: true, contentType: file.type })
    if (uploadError) return { error: `Error al subir la foto: ${uploadError.message}` }

    // Cache-busting: la ruta es fija (avatar.ext), así el navegador no sirve la vieja.
    const { data: pub } = admin.storage.from('user-avatars').getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${new Date().getTime()}`

    const { error: updateError } = await admin.from('users').update({ avatar_url: url }).eq('id', userId)
    if (updateError) return { error: updateError.message }

    revalidatePath('/users')
    return { success: true, url }
  } catch (e) {
    console.error('uploadUserAvatarFor failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido al subir la foto' }
  }
}

export async function adminChangeUserPassword(payload: {
  userId: string
  newPassword: string
}) {
  try {
    await requireUserManager()

    if (payload.newPassword.length < 8) {
      return { error: 'La contraseña debe tener al menos 8 caracteres.' }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno.' }
    }

    const admin = createAdminClient()

    const { error } = await admin.auth.admin.updateUserById(payload.userId, {
      password: payload.newPassword,
    })
    if (error) return { error: error.message }

    return { success: true }
  } catch (e) {
    console.error('adminChangeUserPassword failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido al cambiar contraseña' }
  }
}

export async function deleteUser(targetUserId: string) {
  try {
    const actorRole = await requireUserManager()

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno.' }
    }

    const admin = createAdminClient()

    // Anti-escalada: solo un admin puede eliminar a otro admin.
    if (actorRole !== 'admin') {
      const { data: target } = await admin.from('users').select('role').eq('id', targetUserId).maybeSingle()
      if (target?.role === 'admin') {
        return { error: 'Solo un admin puede eliminar cuentas admin.' }
      }
    }

    // Borrar PRIMERO la fila de public.users (vía admin/PostgREST). Esto dispara
    // el cascade a tablas hijas y el SET NULL de auditoría bajo nuestro control.
    // Si algo falla acá, PostgREST devuelve el error ESPECÍFICO de Postgres
    // (constraint/trigger con nombre), mucho más útil que el genérico "Database
    // error deleting user" que devuelve GoTrue cuando el mismo fallo ocurre
    // dentro de su cascade. Como la FK es public.users.id -> auth.users.id, borrar
    // public.users NO toca auth.users: si esto falla, no queda nada a medias.
    const { error: pubErr } = await admin.from('users').delete().eq('id', targetUserId)
    if (pubErr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = pubErr as any
      const detail = [e.message, e.details, e.hint].filter(Boolean).join(' — ')
      console.error('deleteUser: fallo al borrar public.users:', detail)
      return { error: `No se pudo eliminar el perfil: ${detail}` }
    }

    // El perfil ya no existe en la app. Ahora quitamos el login (auth). Si esto
    // falla, el perfil igual ya está eliminado (no aparece en /users ni puede
    // operar); solo queda un remanente de acceso que se limpia aparte.
    const { error: authError } = await admin.auth.admin.deleteUser(targetUserId)
    if (authError) {
      console.error('deleteUser: public.users borrado pero auth.deleteUser falló:', authError.message)
    }

    revalidatePath('/users')
    return { success: true }
  } catch (e) {
    console.error('deleteUser failed:', e)
    return { error: e instanceof Error ? e.message : 'Error desconocido al eliminar usuario' }
  }
}
