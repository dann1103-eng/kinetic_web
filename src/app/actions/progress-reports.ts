'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { ProgressReport, ProgressReportData } from '@/types/db'

/**
 * Roles con poder para editar/eliminar informes en CUALQUIER estado
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

export interface CreateProgressReportInput {
  childId: string
  serviceType: string
  periodStarts: string // YYYY-MM-DD
  periodEnds: string   // YYYY-MM-DD
}

/**
 * Crea un draft de progress_report en modo file. Si ya existe uno para
 * (childId, serviceType, periodStarts) lo retorna en su estado actual.
 *
 * Las terapistas elaboran el informe por su cuenta y lo suben como archivo,
 * por lo que no se requiere seleccionar plantilla.
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

  const { data: created, error: insertErr } = await supabase
    .from('progress_reports')
    .insert({
      child_id: input.childId,
      service_type: input.serviceType,
      period_starts: input.periodStarts,
      period_ends: input.periodEnds,
      authored_by_user_id: user.id,
      data_json: {},
      template_id: null,
      upload_kind: 'file',
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
  const { supabase, user } = await getActor()

  // Admin / coordinadoras pueden editar en CUALQUIER estado
  const isSuperEditor = REPORT_SUPER_EDITORS.includes(user.role)
  const client = isSuperEditor ? createAdminClient() : supabase

  const patch: Partial<Omit<ProgressReport, 'id' | 'created_at'>> = {
    data_json: input.data,
    visible_to_family: input.visibleToFamily,
    sessions_attended_count: Math.max(0, Math.floor(input.sessionsAttendedCount || 0)),
  }
  if (input.periodStarts) patch.period_starts = input.periodStarts
  if (input.periodEnds) patch.period_ends = input.periodEnds

  const { data, error } = await client
    .from('progress_reports')
    .update(patch)
    .eq('id', reportId)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo guardar el borrador.' }
  }

  revalidatePath(`/familias/${(data as ProgressReport).child_id}`)
  revalidatePath('/aprobaciones')
  revalidatePath('/portal/agenda-digital')
  return { ok: true, report: data as ProgressReport }
}

/**
 * Guarda las notas visibles para la familia en un informe cuatrimestral.
 * Solo puede hacerlo el autor o un admin mientras el informe esté en borrador.
 */
export async function updateProgressReportNotes(
  reportId: string,
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  // Super editors pueden modificar notas en cualquier status; el autor solo en draft/rejected.
  const isSuperEditor = REPORT_SUPER_EDITORS.includes(user.role)
  const client = isSuperEditor ? createAdminClient() : supabase

  const query = client
    .from('progress_reports')
    .update({ family_notes: notes?.trim() || null })
    .eq('id', reportId)

  const { error } = isSuperEditor
    ? await query
    : await query.in('status', ['draft', 'rejected'])

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
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
 * Elimina un informe de avances.
 *
 * Permisos:
 *   • Autor (terapista): solo si status='draft'
 *   • Admin / coordinadora_familias / coordinadora_terapias: cualquier status
 *
 * Borra también el archivo del bucket si existía.
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

  const isAuthor = (report as { authored_by_user_id: string | null }).authored_by_user_id === user.id
  const isSuperEditor = REPORT_SUPER_EDITORS.includes(user.role)

  if (!isSuperEditor) {
    if (!isAuthor) {
      return { ok: false, error: 'Sin permisos para eliminar este informe.' }
    }
    if (report.status !== 'draft') {
      return { ok: false, error: 'Solo se pueden eliminar informes en borrador.' }
    }
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
