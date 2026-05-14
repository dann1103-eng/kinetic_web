'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
]
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function getAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: appUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()
  return appUser
}

function validateFile(file: unknown): { error: string } | { file: File } {
  if (!(file instanceof File)) return { error: 'Archivo inválido.' }
  if (file.size <= 0) return { error: 'Archivo vacío.' }
  if (file.size > MAX_BYTES) return { error: 'El archivo supera el límite de 10 MB.' }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      error:
        'Formato no permitido. Usa PDF, Word, Excel o imagen (PNG/JPG/WebP).',
    }
  }
  return { file }
}

function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
}

async function uploadToBucket(
  kind: 'progress' | 'session',
  reportId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const admin = createAdminClient()
  const cleanName = safeFileName(file.name)
  const path = `${kind}/${reportId}/${Date.now()}-${cleanName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await admin.storage
    .from('reports-files')
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: file.type,
    })
  if (error) throw new Error(`Error al subir el archivo: ${error.message}`)
  return { path, url: path }
}

async function removeFromBucket(path: string) {
  const admin = createAdminClient()
  await admin.storage.from('reports-files').remove([path])
}

// ──────────────────────────────────────────────────────────────────────────
// PROGRESS REPORTS — solo archivo en Fase A
// ──────────────────────────────────────────────────────────────────────────

export async function uploadProgressReportFile(
  formData: FormData,
): Promise<Result<{ file_url: string; file_name: string }>> {
  const reportId = formData.get('reportId')
  if (typeof reportId !== 'string' || !reportId) {
    return { ok: false, error: 'reportId requerido.' }
  }

  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const validation = validateFile(formData.get('file'))
  if ('error' in validation) return { ok: false, error: validation.error }
  const file = validation.file

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('progress_reports')
    .select('id, authored_by_user_id, child_id, file_url')
    .eq('id', reportId)
    .single()
  if (!report) return { ok: false, error: 'Informe no encontrado.' }

  const isAuthor = report.authored_by_user_id === auth.id
  const isAdmin = ['admin', 'directora'].includes(auth.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Solo el autor o un admin pueden subir el archivo.' }
  }

  // Borrar archivo anterior si existe
  if (report.file_url) {
    await removeFromBucket(report.file_url).catch(() => {
      /* best effort */
    })
  }

  let uploaded
  try {
    uploaded = await uploadToBucket('progress', reportId, file)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al subir el archivo.',
    }
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('progress_reports')
    .update({
      upload_kind: 'file',
      file_url: uploaded.path,
      file_name: file.name,
      file_size_bytes: file.size,
      file_mime_type: file.type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (updateError) {
    return { ok: false, error: `Error al guardar: ${updateError.message}` }
  }

  revalidatePath(`/familias`, 'layout')
  return { ok: true, data: { file_url: uploaded.path, file_name: file.name } }
}

export async function removeProgressReportFile(
  reportId: string,
): Promise<Result<null>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('progress_reports')
    .select('id, authored_by_user_id, file_url')
    .eq('id', reportId)
    .single()
  if (!report) return { ok: false, error: 'Informe no encontrado.' }

  const isAuthor = report.authored_by_user_id === auth.id
  const isAdmin = ['admin', 'directora'].includes(auth.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Sin permisos.' }
  }

  if (report.file_url) {
    await removeFromBucket(report.file_url).catch(() => {})
  }

  const admin = createAdminClient()
  await admin
    .from('progress_reports')
    .update({
      upload_kind: 'editor',
      file_url: null,
      file_name: null,
      file_size_bytes: null,
      file_mime_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  revalidatePath(`/familias`, 'layout')
  return { ok: true, data: null }
}

// ──────────────────────────────────────────────────────────────────────────
// SESSION REPORTS — multimodal
// ──────────────────────────────────────────────────────────────────────────

export async function uploadSessionReportFile(
  formData: FormData,
): Promise<Result<{ file_url: string; file_name: string }>> {
  const reportId = formData.get('reportId')
  if (typeof reportId !== 'string' || !reportId) {
    return { ok: false, error: 'reportId requerido.' }
  }

  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const validation = validateFile(formData.get('file'))
  if ('error' in validation) return { ok: false, error: validation.error }
  const file = validation.file

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('session_reports')
    .select('id, therapist_id, child_id, file_url')
    .eq('id', reportId)
    .single()
  if (!report) return { ok: false, error: 'Reporte no encontrado.' }

  const isAuthor = report.therapist_id === auth.id
  const isAdmin = ['admin', 'directora'].includes(auth.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Solo el terapista autor o un admin pueden subir el archivo.' }
  }

  if (report.file_url) {
    await removeFromBucket(report.file_url).catch(() => {})
  }

  let uploaded
  try {
    uploaded = await uploadToBucket('session', reportId, file)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al subir el archivo.',
    }
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('session_reports')
    .update({
      upload_kind: 'file',
      file_url: uploaded.path,
      file_name: file.name,
      file_size_bytes: file.size,
      file_mime_type: file.type,
      // Limpia campos del editor cuando se sube archivo
      actividades: '',
      respuesta_del_nino: '',
      tarea_para_casa: '',
      observaciones_internas: '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (updateError) {
    return { ok: false, error: `Error al guardar: ${updateError.message}` }
  }

  revalidatePath(`/familias`, 'layout')
  revalidatePath(`/mi-dia`)
  return { ok: true, data: { file_url: uploaded.path, file_name: file.name } }
}

export async function removeSessionReportFile(
  reportId: string,
): Promise<Result<null>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('session_reports')
    .select('id, therapist_id, file_url')
    .eq('id', reportId)
    .single()
  if (!report) return { ok: false, error: 'Reporte no encontrado.' }

  const isAuthor = report.therapist_id === auth.id
  const isAdmin = ['admin', 'directora'].includes(auth.role)
  if (!isAuthor && !isAdmin) return { ok: false, error: 'Sin permisos.' }

  if (report.file_url) {
    await removeFromBucket(report.file_url).catch(() => {})
  }

  const admin = createAdminClient()
  await admin
    .from('session_reports')
    .update({
      upload_kind: 'editor',
      file_url: null,
      file_name: null,
      file_size_bytes: null,
      file_mime_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  revalidatePath(`/familias`, 'layout')
  revalidatePath(`/mi-dia`)
  return { ok: true, data: null }
}

// ──────────────────────────────────────────────────────────────────────────
// Signed URLs para servir el archivo (privado)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Genera una URL firmada (válida 5 minutos) para descargar el archivo
 * almacenado en `path` dentro del bucket reports-files. Se llama desde
 * componentes server cuando se necesita el link de download.
 */
export async function getReportFileSignedUrl(
  path: string,
): Promise<Result<string>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('reports-files')
    .createSignedUrl(path, 60 * 5)

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'No se pudo generar el link de descarga.',
    }
  }
  return { ok: true, data: data.signedUrl }
}
