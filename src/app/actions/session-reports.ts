'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { SessionReport } from '@/types/db'

/**
 * Roles con poder para editar/eliminar reportes en CUALQUIER estado
 * (no solo borrador). Bypassean RLS via admin client.
 */
const REPORT_SUPER_EDITORS = ['admin', 'coordinadora_familias', 'coordinadora_terapias']

/** Respeta impersonación. */
async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

export interface SessionReportDraftInput {
  actividades: string
  respuesta_del_nino: string
  tarea_para_casa: string
  observaciones_internas: string
  visible_to_family: boolean
}

type Actor = { id: string; role: string }
type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Idempotente: dado un sessionId, retorna el reporte existente o crea un draft vacío.
 * Valida que el actor sea la terapista de la sesión. Helper compartido entre
 * `createOrGetSessionReport` y `createOrGetSessionReportForAppointment`.
 */
async function ensureReportForSession(
  supabase: ServerClient,
  user: Actor,
  sessionId: string,
): Promise<{ ok: true; report: SessionReport } | { ok: false; error: string }> {
  // Buscar reporte existente
  const { data: existing } = await supabase
    .from('session_reports')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) {
    return { ok: true, report: existing as SessionReport }
  }

  // Cargar la sesión para derivar appointment_id, child_id, therapist_id
  const { data: session } = await supabase
    .from('therapy_sessions')
    .select('id, appointment_id, child_id, therapist_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) {
    return { ok: false, error: 'Sesión no encontrada.' }
  }

  if ((session as { therapist_id: string | null }).therapist_id !== user.id) {
    return { ok: false, error: 'Solo la terapista de la sesión puede crear el reporte.' }
  }

  const sess = session as { appointment_id: string; child_id: string }

  const { data: created, error: insertErr } = await supabase
    .from('session_reports')
    .insert({
      session_id: sessionId,
      appointment_id: sess.appointment_id,
      child_id: sess.child_id,
      therapist_id: user.id,
    })
    .select('*')
    .single()

  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? 'Error al crear el reporte.' }
  }

  return { ok: true, report: created as SessionReport }
}

/**
 * Idempotente: si ya existe reporte para la sesión lo retorna; si no, crea draft vacío.
 * Se llama al abrir el modal de reporte por primera vez.
 */
export async function createOrGetSessionReport(sessionId: string): Promise<
  | { ok: true; report: SessionReport }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()
  const res = await ensureReportForSession(supabase, user, sessionId)
  if (res.ok) revalidatePath('/mi-dia')
  return res
}

/**
 * Igual que `createOrGetSessionReport`, pero parte de una CITA en vez de una sesión.
 * Sirve para terapias ya completadas que nunca tuvieron una `therapy_session`
 * (citas marcadas completadas directo, datos de seed, o despacho por otro flujo):
 * crea la sesión faltante en estado `completed` y luego el reporte.
 */
export async function createOrGetSessionReportForAppointment(
  appointmentId: string,
): Promise<
  | { ok: true; report: SessionReport; sessionId: string }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()

  // Cargar la cita para validar dueño y derivar child_id.
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, therapist_id, event_type')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) {
    return { ok: false, error: 'Cita no encontrada.' }
  }

  const a = appt as {
    child_id: string | null
    therapist_id: string | null
    event_type: string | null
  }

  if (a.therapist_id !== user.id) {
    return { ok: false, error: 'Solo la terapista de la cita puede subir el reporte.' }
  }
  if (a.event_type !== 'terapia') {
    return { ok: false, error: 'Solo las terapias tienen reporte de sesión.' }
  }
  if (!a.child_id) {
    return { ok: false, error: 'La cita no tiene un niño/a asociado.' }
  }

  // Buscar la sesión de la cita; crearla (completada) si no existe.
  let sessionId: string
  const { data: existingSession } = await supabase
    .from('therapy_sessions')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (existingSession) {
    sessionId = (existingSession as { id: string }).id
  } else {
    const { data: createdSession, error: sessErr } = await supabase
      .from('therapy_sessions')
      .insert({
        appointment_id: appointmentId,
        therapist_id: user.id,
        child_id: a.child_id,
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (sessErr || !createdSession) {
      return { ok: false, error: sessErr?.message ?? 'No se pudo crear la sesión.' }
    }
    sessionId = (createdSession as { id: string }).id
  }

  const res = await ensureReportForSession(supabase, user, sessionId)
  if (!res.ok) return res

  revalidatePath('/mi-dia')
  return { ok: true, report: res.report, sessionId }
}

/**
 * Actualiza el contenido del reporte. Solo permitido si está en draft o rejected.
 * RLS garantiza que solo la terapista autora puede.
 * Al guardar en modo editor se limpian los campos del archivo (si existían).
 */
export async function updateSessionReportDraft(
  reportId: string,
  fields: SessionReportDraftInput,
): Promise<{ ok: true; report: SessionReport } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  // Admin / coordinadoras pueden editar reportes en CUALQUIER estado
  // (incl. approved / sent_to_family). Usan admin client para bypasear RLS.
  const isSuperEditor = REPORT_SUPER_EDITORS.includes(user.role)
  const client = isSuperEditor ? createAdminClient() : supabase

  const { data, error } = await client
    .from('session_reports')
    .update({
      actividades: fields.actividades,
      respuesta_del_nino: fields.respuesta_del_nino,
      tarea_para_casa: fields.tarea_para_casa,
      observaciones_internas: fields.observaciones_internas,
      visible_to_family: fields.visible_to_family,
      upload_kind: 'editor',
      file_url: null,
      file_name: null,
      file_size_bytes: null,
      file_mime_type: null,
    })
    .eq('id', reportId)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo guardar el borrador.' }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  revalidatePath('/portal/agenda-digital')
  return { ok: true, report: data as SessionReport }
}

export async function submitSessionReport(reportId: string): Promise<
  | { ok: true; report: SessionReport }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()

  const { data, error } = await supabase.rpc('submit_session_report', {
    p_report_id: reportId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Reporte no encontrado.' }
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('invalid_state_for_submit')) {
      return { ok: false, error: 'El reporte no está en estado borrador.' }
    }
    if (msg.includes('actividades_required')) {
      return { ok: false, error: 'Llená al menos el campo de actividades antes de enviar.' }
    }
    return { ok: false, error: 'Error al enviar el reporte.' }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  return { ok: true, report: data as SessionReport }
}

export async function approveSessionReport(reportId: string): Promise<
  | { ok: true; report: SessionReport }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()

  const { data, error } = await supabase.rpc('approve_session_report', {
    p_report_id: reportId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Reporte no encontrado.' }
    if (msg.includes('not_authorized')) {
      return { ok: false, error: 'Solo la directora o admin pueden aprobar.' }
    }
    if (msg.includes('invalid_state_for_approve')) {
      return { ok: false, error: 'El reporte no está esperando aprobación.' }
    }
    return { ok: false, error: 'Error al aprobar el reporte.' }
  }

  const report = data as SessionReport
  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  if (report.status === 'sent_to_family') {
    revalidatePath('/portal/agenda-digital')
  }
  return { ok: true, report }
}

export async function rejectSessionReport(
  reportId: string,
  reason: string,
): Promise<{ ok: true; report: SessionReport } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  if (!reason || reason.trim().length < 10) {
    return { ok: false, error: 'El motivo debe tener al menos 10 caracteres.' }
  }

  const { data, error } = await supabase.rpc('reject_session_report', {
    p_report_id: reportId,
    p_reason: reason.trim(),
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Reporte no encontrado.' }
    if (msg.includes('not_authorized')) {
      return { ok: false, error: 'Solo la directora o admin pueden rechazar.' }
    }
    if (msg.includes('invalid_state_for_reject')) {
      return { ok: false, error: 'El reporte no está esperando aprobación.' }
    }
    if (msg.includes('reason_too_short')) {
      return { ok: false, error: 'El motivo debe tener al menos 10 caracteres.' }
    }
    return { ok: false, error: 'Error al rechazar el reporte.' }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  return { ok: true, report: data as SessionReport }
}

/**
 * Elimina un reporte de sesión.
 *
 * Permisos:
 *   • Autor (terapista): solo si status='draft'
 *   • Admin / coordinadora_familias / coordinadora_terapias: cualquier status
 *
 * Borra también el archivo del bucket si existía.
 */
export async function deleteSessionReport(
  reportId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  const { data: report } = await supabase
    .from('session_reports')
    .select('id, therapist_id, status, file_url')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return { ok: false, error: 'Reporte no encontrado.' }

  const isAuthor = (report as { therapist_id: string | null }).therapist_id === user.id
  const isSuperEditor = REPORT_SUPER_EDITORS.includes(user.role)

  if (!isSuperEditor) {
    if (!isAuthor) {
      return { ok: false, error: 'Sin permisos para eliminar este reporte.' }
    }
    if (report.status !== 'draft') {
      return { ok: false, error: 'Solo se pueden eliminar reportes en borrador.' }
    }
  }

  const admin = createAdminClient()

  // Borrar archivo del bucket si existe
  const fileUrl = (report as { file_url: string | null }).file_url
  if (fileUrl) {
    await admin.storage.from('reports-files').remove([fileUrl]).catch(() => {})
  }

  const { error: deleteError } = await admin
    .from('session_reports')
    .delete()
    .eq('id', reportId)

  if (deleteError) {
    return { ok: false, error: `Error al eliminar: ${deleteError.message}` }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  return { ok: true }
}
