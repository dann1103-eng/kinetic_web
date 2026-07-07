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
  // Formatos default de cámara iPhone (iOS) — se aceptan tal cual.
  'image/heic',
  'image/heif',
]

// Extensión → MIME canónico. Validamos y subimos por EXTENSIÓN porque el MIME
// que reporta el navegador NO es confiable: Word/Excel llegan a veces como
// 'application/octet-stream' o vacío (según SO/navegador), y así el bucket —que
// tiene whitelist de MIME— rechazaba el archivo aunque el formato fuera válido.
// El contentType que mandamos al bucket se deriva de la extensión.
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB (fotos de iPhone HEIC ~5MB, JPEG ~10MB)

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

function validateFile(file: unknown): { error: string } | { file: File; contentType: string } {
  if (!(file instanceof File)) return { error: 'Archivo inválido.' }
  if (file.size <= 0) return { error: 'Archivo vacío.' }
  if (file.size > MAX_BYTES) {
    return { error: `El archivo supera el límite de ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` }
  }
  // Aceptamos por EXTENSIÓN (confiable) y sólo caemos al MIME del navegador si la
  // extensión no está mapeada. El contentType para el bucket sale de la extensión.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const contentType = EXT_TO_MIME[ext] ?? (ALLOWED_MIME_TYPES.includes(file.type) ? file.type : null)
  if (!contentType) {
    return {
      error: 'Formato no permitido. Usa PDF, Word, Excel o imagen (PNG/JPG/WebP/HEIC).',
    }
  }
  return { file, contentType }
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
  contentType: string,
): Promise<{ path: string; url: string }> {
  const admin = createAdminClient()
  const cleanName = safeFileName(file.name)
  const path = `${kind}/${reportId}/${Date.now()}-${cleanName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await admin.storage
    .from('reports-files')
    .upload(path, arrayBuffer, {
      upsert: true,
      // contentType canónico (derivado de la extensión), no el del navegador,
      // para que la whitelist de MIME del bucket lo acepte.
      contentType,
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

// Roles con paridad de "super editor" sobre informes cuatrimestrales — pueden
// subir/reemplazar/quitar el archivo de CUALQUIER informe, no solo el propio.
// Antes solo incluía admin/directora/coordinadoras; 'recepcion' quedaba afuera
// pese a tener paridad en el resto de Administración, así que si recepción
// abría el informe de un niño creado por la terapista (el caso más común: la
// terapista le entrega el archivo a recepción para que lo suba), el guard de
// abajo la rechazaba con un error que el cliente no siempre mostraba.
const PROGRESS_FILE_SUPER_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'terapista',
  'maestra',
]

export async function uploadProgressReportFile(
  formData: FormData,
): Promise<Result<{ file_url: string; file_name: string }>> {
  // Blindaje: TODA la función queda envuelta en try/catch. Antes, si
  // getAuthedUser() o el select inicial lanzaban una excepción no controlada
  // (en vez de devolver { ok:false }), la promesa del cliente se rechazaba SIN
  // pasar por ningún setError (el handler del cliente no tenía catch) — el
  // botón volvía a "Seleccionar archivo" sin ningún mensaje, dando la
  // sensación de "se quedó subiendo sin cargar". Ahora cualquier excepción
  // imprevista también vuelve como un error visible.
  try {
    const reportId = formData.get('reportId')
    if (typeof reportId !== 'string' || !reportId) {
      return { ok: false, error: 'reportId requerido.' }
    }

    const auth = await getAuthedUser()
    if (!auth) return { ok: false, error: 'No autenticado.' }

    const validation = validateFile(formData.get('file'))
    if ('error' in validation) return { ok: false, error: validation.error }
    const file = validation.file
    const contentType = validation.contentType

    const supabase = await createClient()
    const { data: report } = await supabase
      .from('progress_reports')
      .select('id, authored_by_user_id, child_id, file_url')
      .eq('id', reportId)
      .single()
    if (!report) return { ok: false, error: 'Informe no encontrado.' }

    const isAuthor = report.authored_by_user_id === auth.id
    const isAdmin = PROGRESS_FILE_SUPER_ROLES.includes(auth.role)
    if (!isAuthor && !isAdmin) {
      return { ok: false, error: 'Solo el autor o un admin/recepción pueden subir el archivo.' }
    }

    // Borrar archivo anterior si existe
    if (report.file_url) {
      await removeFromBucket(report.file_url).catch(() => {
        /* best effort */
      })
    }

    let uploaded
    try {
      uploaded = await uploadToBucket('progress', reportId, file, contentType)
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
        file_mime_type: contentType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)

    if (updateError) {
      return { ok: false, error: `Error al guardar: ${updateError.message}` }
    }

    revalidatePath(`/familias`, 'layout')
    return { ok: true, data: { file_url: uploaded.path, file_name: file.name } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Error inesperado al subir: ${err.message}` : 'Error inesperado al subir el archivo.',
    }
  }
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
  const isAdmin = PROGRESS_FILE_SUPER_ROLES.includes(auth.role)
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
      upload_kind: 'file',
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
  const contentType = validation.contentType

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('session_reports')
    .select('id, therapist_id, child_id, file_url')
    .eq('id', reportId)
    .single()
  if (!report) return { ok: false, error: 'Reporte no encontrado.' }

  const isAuthor = report.therapist_id === auth.id
  const isAdmin = ['admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias'].includes(auth.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Solo el terapista autor o un admin pueden subir el archivo.' }
  }

  if (report.file_url) {
    await removeFromBucket(report.file_url).catch(() => {})
  }

  let uploaded
  try {
    uploaded = await uploadToBucket('session', reportId, file, contentType)
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
      file_mime_type: contentType,
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
  const isAdmin = ['admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias'].includes(auth.role)
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
const REPORT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getReportFileSignedUrl(
  path: string,
): Promise<Result<string>> {
  const auth = await getAuthedUser()
  if (!auth) return { ok: false, error: 'No autenticado.' }

  // Autorización antes de firmar: el path es `${kind}/${reportId}/...`.
  // Verificamos VÍA RLS (createClient, no admin) que el usuario pueda VER ese
  // informe. Sin esto, cualquier autenticado (incluida una cuenta family del
  // portal) podría descargar el archivo de cualquier niño pasando un path
  // arbitrario — el admin client ignora RLS (IDOR). Firmamos solo si pasa.
  const segments = path.split('/')
  const [kind, reportId] = segments
  if (
    (kind !== 'progress' && kind !== 'session') ||
    !reportId ||
    !REPORT_UUID_RE.test(reportId) ||
    segments.some((s) => s === '' || s === '..')
  ) {
    return { ok: false, error: 'Ruta de archivo inválida.' }
  }

  const supabase = await createClient()
  const { data: report } =
    kind === 'progress'
      ? await supabase
          .from('progress_reports')
          .select('id')
          .eq('id', reportId)
          .maybeSingle()
      : await supabase
          .from('session_reports')
          .select('id')
          .eq('id', reportId)
          .maybeSingle()
  if (!report) {
    return { ok: false, error: 'Informe no encontrado o sin acceso.' }
  }

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
