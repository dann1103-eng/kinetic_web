'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const LOGO_MAX_BYTES = 2 * 1024 * 1024 // 2 MB

/** Guarda la URL del logo de la agencia en app_settings. Solo admins. */
export async function updateAgencyLogoUrl(
  url: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (appUser?.role !== 'admin') return { error: 'Solo admins pueden cambiar el logo.' }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'agency_logo_url', value: url, updated_at: new Date().toISOString() })

  if (error) return { error: `Error al guardar: ${error.message}` }

  // Revalidar todas las páginas que muestran el sidebar
  revalidatePath('/', 'layout')
  return {}
}

/**
 * Sube el logo de la agencia + guarda su URL en app_settings, en un solo paso.
 * Usa admin client (service role) para evitar problemas de RLS sobre storage:
 * la sesión del browser a veces no se propaga al request de storage. La
 * verificación de rol queda en el server, no en RLS.
 */
export async function uploadAgencyLogo(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (appUser?.role !== 'admin') {
    return { ok: false, error: 'Solo admins pueden cambiar el logo.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { ok: false, error: 'Archivo inválido.' }
  }

  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no permitido. Usa PNG, JPG, WebP o SVG.' }
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 2 MB.' }
  }

  const ext =
    file.type === 'image/svg+xml'
      ? 'svg'
      : file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `logo.${ext}`

  // Service role: bypass total de RLS sobre storage.objects
  const admin = createAdminClient()
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('agency-assets')
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) {
    return { ok: false, error: `Error al subir el logo: ${uploadError.message}` }
  }

  const { data: pub } = admin.storage.from('agency-assets').getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error: settingsError } = await admin
    .from('app_settings')
    .upsert({
      key: 'agency_logo_url',
      value: url,
      updated_at: new Date().toISOString(),
    })

  if (settingsError) {
    return { ok: false, error: `Error al guardar: ${settingsError.message}` }
  }

  revalidatePath('/', 'layout')
  return { ok: true, url }
}
