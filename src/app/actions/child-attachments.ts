'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ChildAttachment, ChildAttachmentKind } from '@/types/db'

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  // Formatos default de cámara iPhone (iOS) — se aceptan tal cual.
  'image/heic',
  'image/heif',
]
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB (fotos de iPhone HEIC ~5MB, JPEG ~10MB)

const STAFF_UPLOAD_ROLES = [
  'admin',
  'directora',
  'supervisor',
  'coordinadora_familias',
  'coordinadora_terapias',
  'terapista',
  'maestra',
  'recepcion',
]

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
  return appUser as { id: string; role: string } | null
}

function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
}

function validateFile(file: unknown): { error: string } | { file: File } {
  if (!(file instanceof File)) return { error: 'Archivo inválido.' }
  if (file.size <= 0) return { error: 'Archivo vacío.' }
  if (file.size > MAX_BYTES) return { error: 'El archivo supera el límite de 10 MB.' }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      error: 'Formato no permitido. Usa PDF, Word, Excel o imagen (PNG/JPG/WebP).',
    }
  }
  return { file }
}

/**
 * Sube un adjunto al bucket `reports-files` e inserta una fila en
 * `child_attachments`. Reusa el bucket privado existente con un path:
 *   attachments/{child_id}/{timestamp}-{filename}
 *
 * `formData` debe contener:
 *   - file: File
 *   - childId: string  (o usar opts.childId)
 *   - kind: ChildAttachmentKind (opt)
 *   - title: string (opt)
 *   - description: string (opt)
 *   - visibleToFamily: 'true' | 'false' (opt, default true)
 *   - appointmentId / sessionReportId / progressReportId (opt)
 */
export async function uploadChildAttachment(
  formData: FormData,
): Promise<Result<ChildAttachment>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }
  if (!STAFF_UPLOAD_ROLES.includes(auth.role)) {
    return { ok: false, error: 'Sin permisos para subir adjuntos.' }
  }

  const childId = formData.get('childId')
  if (typeof childId !== 'string' || !childId) {
    return { ok: false, error: 'childId requerido.' }
  }

  const validation = validateFile(formData.get('file'))
  if ('error' in validation) return { ok: false, error: validation.error }
  const file = validation.file

  const kindRaw = formData.get('kind')
  const kind: ChildAttachmentKind =
    typeof kindRaw === 'string' &&
    ['tarea', 'evaluacion', 'imagen', 'informe_adicional', 'otro'].includes(kindRaw)
      ? (kindRaw as ChildAttachmentKind)
      : 'otro'

  const titleRaw = formData.get('title')
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null
  const descriptionRaw = formData.get('description')
  const description =
    typeof descriptionRaw === 'string' && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : null
  const visibleRaw = formData.get('visibleToFamily')
  const visibleToFamily = visibleRaw === 'false' ? false : true

  const appointmentIdRaw = formData.get('appointmentId')
  const appointmentId =
    typeof appointmentIdRaw === 'string' && appointmentIdRaw ? appointmentIdRaw : null
  const sessionReportIdRaw = formData.get('sessionReportId')
  const sessionReportId =
    typeof sessionReportIdRaw === 'string' && sessionReportIdRaw ? sessionReportIdRaw : null
  const progressReportIdRaw = formData.get('progressReportId')
  const progressReportId =
    typeof progressReportIdRaw === 'string' && progressReportIdRaw ? progressReportIdRaw : null

  // Subir al bucket
  const adminClient = createAdminClient()
  const cleanName = safeFileName(file.name)
  const path = `attachments/${childId}/${Date.now()}-${cleanName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await adminClient.storage
    .from('reports-files')
    .upload(path, arrayBuffer, {
      upsert: false,
      contentType: file.type,
    })
  if (uploadError) {
    return { ok: false, error: `Error al subir el archivo: ${uploadError.message}` }
  }

  // Insertar fila
  const { data: row, error: insertError } = await adminClient
    .from('child_attachments')
    .insert({
      child_id: childId,
      appointment_id: appointmentId,
      session_report_id: sessionReportId,
      progress_report_id: progressReportId,
      file_url: path,
      file_name: file.name,
      file_size_bytes: file.size,
      file_mime_type: file.type,
      title,
      description,
      kind,
      visible_to_family: visibleToFamily,
      uploaded_by_user_id: auth.id,
    })
    .select('*')
    .single()

  if (insertError || !row) {
    // best-effort rollback del archivo
    await adminClient.storage.from('reports-files').remove([path]).catch(() => {})
    return {
      ok: false,
      error: `Error al guardar el adjunto: ${insertError?.message ?? 'desconocido'}`,
    }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/portal/agenda')
  revalidatePath('/portal/descargas')
  revalidatePath('/aprobaciones')

  return { ok: true, data: row as ChildAttachment }
}

export async function removeChildAttachment(
  attachmentId: string,
): Promise<Result<null>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('child_attachments')
    .select('id, file_url, uploaded_by_user_id')
    .eq('id', attachmentId)
    .single()
  if (!row) return { ok: false, error: 'Adjunto no encontrado.' }

  const r = row as { id: string; file_url: string; uploaded_by_user_id: string | null }
  const isAuthor = r.uploaded_by_user_id === auth.id
  const isAdmin = ['admin', 'directora'].includes(auth.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Solo el autor o un admin pueden borrar el adjunto.' }
  }

  const adminClient = createAdminClient()
  if (r.file_url) {
    await adminClient.storage.from('reports-files').remove([r.file_url]).catch(() => {})
  }
  const { error: deleteError } = await adminClient
    .from('child_attachments')
    .delete()
    .eq('id', attachmentId)
  if (deleteError) {
    return { ok: false, error: `Error al borrar: ${deleteError.message}` }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/portal/agenda')
  revalidatePath('/portal/descargas')
  revalidatePath('/aprobaciones')
  return { ok: true, data: null }
}

export async function updateChildAttachmentMeta(
  attachmentId: string,
  patch: {
    title?: string | null
    description?: string | null
    visible_to_family?: boolean
    kind?: ChildAttachmentKind
  },
): Promise<Result<null>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }
  if (!STAFF_UPLOAD_ROLES.includes(auth.role)) {
    return { ok: false, error: 'Sin permisos.' }
  }

  const update: Partial<Omit<ChildAttachment, 'id' | 'created_at'>> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.visible_to_family !== undefined) update.visible_to_family = patch.visible_to_family
  if (patch.kind !== undefined) update.kind = patch.kind

  if (Object.keys(update).length === 0) return { ok: true, data: null }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('child_attachments')
    .update(update)
    .eq('id', attachmentId)
  if (error) return { ok: false, error: `Error al actualizar: ${error.message}` }

  revalidatePath('/mi-dia')
  revalidatePath('/portal/agenda')
  revalidatePath('/portal/descargas')
  return { ok: true, data: null }
}

interface ListFilter {
  childId?: string
  appointmentId?: string
  sessionReportId?: string
  progressReportId?: string
  onlyVisibleToFamily?: boolean
}

export async function listChildAttachments(
  filter: ListFilter,
): Promise<Result<ChildAttachment[]>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const supabase = await createClient()
  let query = supabase
    .from('child_attachments')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter.childId) query = query.eq('child_id', filter.childId)
  if (filter.appointmentId) query = query.eq('appointment_id', filter.appointmentId)
  if (filter.sessionReportId) query = query.eq('session_report_id', filter.sessionReportId)
  if (filter.progressReportId) query = query.eq('progress_report_id', filter.progressReportId)
  if (filter.onlyVisibleToFamily) query = query.eq('visible_to_family', true)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as ChildAttachment[] }
}

/**
 * Genera una signed URL (5 min) para descargar el adjunto. Resuelve también
 * el path del bucket validando primero que el usuario tenga acceso vía RLS
 * (si una family pide un attachmentId que no le corresponde, el SELECT
 * fallará y devolvemos error).
 */
export async function getChildAttachmentSignedUrl(
  attachmentId: string,
): Promise<Result<{ url: string; file_name: string }>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('child_attachments')
    .select('id, file_url, file_name')
    .eq('id', attachmentId)
    .single()
  if (!row) return { ok: false, error: 'Adjunto no encontrado o sin acceso.' }
  const r = row as { id: string; file_url: string; file_name: string }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.storage
    .from('reports-files')
    .createSignedUrl(r.file_url, 60 * 5)
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'No se pudo generar el link de descarga.',
    }
  }
  return { ok: true, data: { url: data.signedUrl, file_name: r.file_name } }
}
