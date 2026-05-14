'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { ProgressReport, ProgressReportData } from '@/types/db'

/** Respeta impersonación. */
async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

export interface CreateProgressReportInput {
  childId: string
  serviceType: string
  periodStarts: string // YYYY-MM-DD
  periodEnds: string   // YYYY-MM-DD
  /** Si se omite, se busca la plantilla "Genérica" como fallback. */
  templateId?: string
}

/** Lookup del seed Genérica para fallback cuando el caller no manda templateId. */
async function getGenericProgressTemplateId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .from('report_templates')
    .select('id')
    .eq('kind', 'progress')
    .is('service_type', null)
    .eq('name', 'Informe de avances — Genérica')
    .eq('active', true)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Crea un draft de progress_report. Si ya existe uno para
 * (childId, serviceType, periodStarts) lo retorna en su estado actual.
 */
export async function createProgressReport(input: CreateProgressReportInput): Promise<
  | { ok: true; report: ProgressReport }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getActor()

  if (!input.childId || !input.serviceType) {
    return { ok: false, error: 'Faltan datos del niño/a o tipo de terapia.' }
  }
  if (!input.periodStarts || !input.periodEnds) {
    return { ok: false, error: 'Faltan fechas del período.' }
  }
  if (input.periodStarts > input.periodEnds) {
    return { ok: false, error: 'La fecha de inicio del período debe ser anterior a la de fin.' }
  }

  const { data: existing } = await supabase
    .from('progress_reports')
    .select('*')
    .eq('child_id', input.childId)
    .eq('service_type', input.serviceType)
    .eq('period_starts', input.periodStarts)
    .maybeSingle()

  if (existing) {
    return { ok: true, report: existing as ProgressReport }
  }

  const templateId = input.templateId ?? (await getGenericProgressTemplateId(supabase))
  if (!templateId) {
    return {
      ok: false,
      error: 'No hay plantilla disponible para crear el informe. Contactá a la directora.',
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('progress_reports')
    .insert({
      child_id: input.childId,
      service_type: input.serviceType,
      period_starts: input.periodStarts,
      period_ends: input.periodEnds,
      authored_by_user_id: user.id,
      data_json: {},
      template_id: templateId,
    })
    .select('*')
    .single()

  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? 'Error al crear el informe.' }
  }

  revalidatePath(`/familias/${input.childId}`)
  return { ok: true, report: created as ProgressReport }
}

export interface UpdateProgressReportDraftInput {
  data: ProgressReportData
  visibleToFamily: boolean
  sessionsAttendedCount: number
  periodStarts?: string
  periodEnds?: string
}

export async function updateProgressReportDraft(
  reportId: string,
  input: UpdateProgressReportDraftInput,
): Promise<{ ok: true; report: ProgressReport } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  const patch: Partial<Omit<ProgressReport, 'id' | 'created_at'>> = {
    data_json: input.data,
    visible_to_family: input.visibleToFamily,
    sessions_attended_count: Math.max(0, Math.floor(input.sessionsAttendedCount || 0)),
  }
  if (input.periodStarts) patch.period_starts = input.periodStarts
  if (input.periodEnds) patch.period_ends = input.periodEnds

  const { data, error } = await supabase
    .from('progress_reports')
    .update(patch)
    .eq('id', reportId)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo guardar el borrador.' }
  }

  revalidatePath(`/familias/${(data as ProgressReport).child_id}`)
  return { ok: true, report: data as ProgressReport }
}

export async function submitProgressReport(reportId: string): Promise<
  | { ok: true; report: ProgressReport }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()

  const { data, error } = await supabase.rpc('submit_progress_report', {
    p_report_id: reportId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Informe no encontrado.' }
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('invalid_state_for_submit')) {
      return { ok: false, error: 'El informe no está en estado borrador.' }
    }
    if (msg.includes('seguimiento_required')) {
      return { ok: false, error: 'Llená la sección de seguimiento antes de enviar.' }
    }
    if (msg.includes('logros_required')) {
      return { ok: false, error: 'Llená la sección de logros obtenidos antes de enviar.' }
    }
    if (msg.includes('required_block_empty')) {
      // Mensaje del RPC: "required_block_empty: <key>"
      const match = msg.match(/required_block_empty:\s*([^\s]+)/)
      const key = match?.[1]
      return {
        ok: false,
        error: key
          ? `Falta llenar la sección obligatoria: ${key}.`
          : 'Faltan campos obligatorios en el informe.',
      }
    }
    if (msg.includes('required_block_invalid')) {
      return { ok: false, error: 'Una sección obligatoria tiene formato inválido.' }
    }
    if (msg.includes('template_not_found')) {
      return { ok: false, error: 'La plantilla del informe ya no existe. Contactá a la directora.' }
    }
    return { ok: false, error: 'Error al enviar el informe.' }
  }

  const report = data as ProgressReport
  revalidatePath(`/familias/${report.child_id}`)
  revalidatePath('/aprobaciones')
  return { ok: true, report }
}

export async function approveProgressReport(reportId: string): Promise<
  | { ok: true; report: ProgressReport }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()

  const { data, error } = await supabase.rpc('approve_progress_report', {
    p_report_id: reportId,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Informe no encontrado.' }
    if (msg.includes('not_authorized')) {
      return { ok: false, error: 'Solo la directora o admin pueden aprobar.' }
    }
    if (msg.includes('invalid_state_for_approve')) {
      return { ok: false, error: 'El informe no está esperando aprobación.' }
    }
    return { ok: false, error: 'Error al aprobar el informe.' }
  }

  const report = data as ProgressReport
  revalidatePath(`/familias/${report.child_id}`)
  revalidatePath('/aprobaciones')
  if (report.status === 'sent_to_family') {
    revalidatePath('/portal/agenda-digital')
  }
  return { ok: true, report }
}

export async function rejectProgressReport(
  reportId: string,
  reason: string,
): Promise<{ ok: true; report: ProgressReport } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  if (!reason || reason.trim().length < 10) {
    return { ok: false, error: 'El motivo debe tener al menos 10 caracteres.' }
  }

  const { data, error } = await supabase.rpc('reject_progress_report', {
    p_report_id: reportId,
    p_reason: reason.trim(),
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('report_not_found')) return { ok: false, error: 'Informe no encontrado.' }
    if (msg.includes('not_authorized')) {
      return { ok: false, error: 'Solo la directora o admin pueden rechazar.' }
    }
    if (msg.includes('invalid_state_for_reject')) {
      return { ok: false, error: 'El informe no está esperando aprobación.' }
    }
    if (msg.includes('reason_too_short')) {
      return { ok: false, error: 'El motivo debe tener al menos 10 caracteres.' }
    }
    return { ok: false, error: 'Error al rechazar el informe.' }
  }

  const report = data as ProgressReport
  revalidatePath(`/familias/${report.child_id}`)
  revalidatePath('/aprobaciones')
  return { ok: true, report }
}

/**
 * Elimina un informe de avances en borrador (status='draft').
 * Borra el archivo del bucket si existía.
 * Solo puede hacerlo el autor (terapista) o un admin/directora.
 */
export async function deleteProgressReport(
  reportId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  const { data: report } = await supabase
    .from('progress_reports')
    .select('id, authored_by_user_id, child_id, status, file_url')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return { ok: false, error: 'Informe no encontrado.' }
  if (report.status !== 'draft') {
    return { ok: false, error: 'Solo se pueden eliminar informes en borrador.' }
  }

  const isAuthor = (report as { authored_by_user_id: string | null }).authored_by_user_id === user.id
  const isAdmin = ['admin', 'directora'].includes(user.role)
  if (!isAuthor && !isAdmin) {
    return { ok: false, error: 'Sin permisos para eliminar este informe.' }
  }

  const admin = createAdminClient()

  // Borrar archivo del bucket si existe
  const fileUrl = (report as { file_url: string | null }).file_url
  if (fileUrl) {
    await admin.storage.from('reports-files').remove([fileUrl]).catch(() => {})
  }

  const { error: deleteError } = await admin
    .from('progress_reports')
    .delete()
    .eq('id', reportId)

  if (deleteError) {
    return { ok: false, error: `Error al eliminar: ${deleteError.message}` }
  }

  const childId = (report as { child_id: string }).child_id
  revalidatePath(`/familias/${childId}`)
  revalidatePath('/aprobaciones')
  return { ok: true }
}
