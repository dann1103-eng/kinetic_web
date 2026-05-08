'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { SessionReport } from '@/types/db'

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

/**
 * Idempotente: si ya existe reporte para la sesión lo retorna; si no, crea draft vacío.
 * Se llama al abrir el modal de reporte por primera vez.
 */
export async function createOrGetSessionReport(sessionId: string): Promise<
  | { ok: true; report: SessionReport }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()

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

  revalidatePath('/mi-dia')
  return { ok: true, report: created as SessionReport }
}

/**
 * Actualiza el contenido del reporte. Solo permitido si está en draft o rejected.
 * RLS garantiza que solo la terapista autora puede.
 */
export async function updateSessionReportDraft(
  reportId: string,
  fields: SessionReportDraftInput,
): Promise<{ ok: true; report: SessionReport } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  const { data, error } = await supabase
    .from('session_reports')
    .update({
      actividades: fields.actividades,
      respuesta_del_nino: fields.respuesta_del_nino,
      tarea_para_casa: fields.tarea_para_casa,
      observaciones_internas: fields.observaciones_internas,
      visible_to_family: fields.visible_to_family,
    })
    .eq('id', reportId)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo guardar el borrador.' }
  }

  revalidatePath('/mi-dia')
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
