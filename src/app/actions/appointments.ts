'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { appointmentsOverlap, findClosureAffecting } from '@/lib/domain/appointment'
import type {
  Appointment,
  AppointmentStatus,
  EventType,
  ExtraReason,
  Modality,
  ServiceType,
} from '@/types/db'

const STAFF_ROLES_SCHEDULE = ['admin', 'supervisor', 'directora', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion']

interface CreateAppointmentInput {
  /** Requerido salvo en evaluaciones a personas nuevas (usar external_child_name). */
  child_id?: string | null
  /** Nombre libre de la persona evaluada (solo evaluaciones sin niño registrado). */
  external_child_name?: string | null
  /** Código del catálogo de evaluaciones elegido (solo evaluaciones). */
  service_code?: string | null
  therapist_id?: string | null
  event_type: EventType
  service_type?: ServiceType | null
  modality: Modality
  starts_at: string
  ends_at: string
  notes?: string | null
  /** Solo cuando event_type='otro' — etiqueta libre. */
  custom_event_label?: string | null
  /** Terapia extra (cobertura / adicional) — para pago aparte a mensual_fijo. */
  is_extra?: boolean
  /** Motivo de la terapia extra (solo si is_extra=true). */
  extra_reason?: ExtraReason | null
  /** Si true, salta validación de cierre institucional (solo admin). */
  force?: boolean
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<{ ok: true; appointmentId: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  if (!STAFF_ROLES_SCHEDULE.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para agendar citas' }
  }

  const isEvaluacion = input.event_type === 'evaluacion'

  // Validaciones básicas
  if (isEvaluacion) {
    // Evaluaciones: persona nueva (nombre libre) + tipo de evaluación + quién la da.
    if (!input.external_child_name || input.external_child_name.trim().length === 0) {
      return { ok: false, error: 'La evaluación requiere el nombre de la persona evaluada' }
    }
    if (!input.service_code) return { ok: false, error: 'Elegí el tipo de evaluación' }
    if (!input.therapist_id) return { ok: false, error: 'Asigná a quién dará la evaluación' }
  } else if (!input.child_id) {
    return { ok: false, error: 'Falta el niño/a' }
  }
  if (input.event_type === 'terapia') {
    if (!input.service_type) return { ok: false, error: 'Las terapias requieren tipo de servicio' }
    if (!input.therapist_id) return { ok: false, error: 'Las terapias requieren terapista asignado' }
  }
  if (input.event_type === 'otro') {
    if (!input.custom_event_label || input.custom_event_label.trim().length === 0) {
      return { ok: false, error: 'Para el tipo "Otro" hay que poner un nombre del evento' }
    }
  }
  if (new Date(input.ends_at).getTime() <= new Date(input.starts_at).getTime()) {
    return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio' }
  }
  const durationMin = (new Date(input.ends_at).getTime() - new Date(input.starts_at).getTime()) / 60_000
  if (durationMin < 15) return { ok: false, error: 'La duración mínima es de 15 minutos' }

  const supabase = await createClient()

  // Validar que el niño existe y está activo (no aplica a evaluaciones con nombre libre)
  let child: { id: string; current_phase_code: string | null; family_id: string } | null = null
  if (input.child_id) {
    const { data: childRow } = await supabase
      .from('children')
      .select('id, current_phase_code, family_id')
      .eq('id', input.child_id)
      .maybeSingle()
    if (!childRow) return { ok: false, error: 'Niño/a no encontrado' }
    // No agendar a niños en fase terminal (alta o retiro)
    if (
      childRow.current_phase_code === '5_1_alta_terapeutica' ||
      childRow.current_phase_code === '5_2_retirado'
    ) {
      return { ok: false, error: 'El niño/a ya no está activo en Kinetic' }
    }
    child = childRow
  }

  // Validar cierre institucional (saltable con force por admin)
  if (!(input.force && ctx.appUser.role === 'admin')) {
    const { data: closures } = await supabase
      .from('institutional_calendar')
      .select('*')
      .gte('date', input.starts_at.slice(0, 10))
      .lte('date', input.ends_at.slice(0, 10))
    const affecting = findClosureAffecting(input.starts_at, closures ?? [])
    if (affecting) {
      return {
        ok: false,
        error: `Centro cerrado ese día: ${affecting.name}. Si es excepción, pídale a admin que lo agende con override.`,
      }
    }
  }

  // Validar solapamiento del terapista
  if (input.therapist_id) {
    const dayStart = new Date(input.starts_at)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(input.starts_at)
    dayEnd.setHours(23, 59, 59, 999)

    const { data: sameTherapistDay } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at')
      .eq('therapist_id', input.therapist_id)
      .in('status', ['scheduled', 'in_progress'])
      .gte('starts_at', dayStart.toISOString())
      .lte('starts_at', dayEnd.toISOString())

    const overlap = (sameTherapistDay ?? []).find((a) =>
      appointmentsOverlap(a as { starts_at: string; ends_at: string }, {
        starts_at: input.starts_at,
        ends_at: input.ends_at,
      }),
    )
    if (overlap) {
      return { ok: false, error: 'El/la terapista ya tiene una cita en ese horario' }
    }
  }

  // Las evaluaciones se contabilizan automáticamente para la planilla de
  // servicios profesionales (extraordinarias), con su pago tomado del catálogo.
  const isExtra = isEvaluacion ? true : (input.is_extra ?? false)
  const extraReason: ExtraReason | null = isEvaluacion
    ? 'evaluacion'
    : input.is_extra
      ? (input.extra_reason ?? null)
      : null

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      child_id: input.child_id || null,
      external_child_name: isEvaluacion ? input.external_child_name!.trim() : null,
      service_code: isEvaluacion ? input.service_code! : null,
      therapist_id: input.therapist_id || null,
      event_type: input.event_type,
      service_type: input.service_type || null,
      modality: input.modality,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes?.trim() || null,
      custom_event_label:
        input.event_type === 'otro' && input.custom_event_label
          ? input.custom_event_label.trim()
          : null,
      is_extra: isExtra,
      extra_reason: extraReason,
      created_by_user_id: ctx.appUser.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Error desconocido' }

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  if (child) revalidatePath(`/familias/${child.family_id}`)
  return { ok: true, appointmentId: data.id }
}

export async function updateAppointment(
  appointmentId: string,
  patch: Partial<Pick<Appointment, 'starts_at' | 'ends_at' | 'modality' | 'service_type' | 'therapist_id' | 'notes' | 'event_type' | 'custom_event_label' | 'is_extra' | 'extra_reason' | 'external_child_name' | 'service_code'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  const supabase = await createClient()
  // RLS hará lo suyo: terapistas solo pueden modificar las suyas; staff todo.
  const { error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', appointmentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/agenda')
  return { ok: true }
}

export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAt: string,
  newEndsAt: string,
): Promise<{ ok: true; newAppointmentId: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (!STAFF_ROLES_SCHEDULE.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos' }
  }

  const supabase = await createClient()
  const { data: orig } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!orig) return { ok: false, error: 'Cita original no encontrada' }

  // Marca la original como 'rescheduled'
  const { error: updErr } = await supabase
    .from('appointments')
    .update({ status: 'rescheduled' })
    .eq('id', appointmentId)
  if (updErr) return { ok: false, error: updErr.message }

  // Crea la nueva cita apuntando a la original
  const { data: created, error: insErr } = await supabase
    .from('appointments')
    .insert({
      child_id: orig.child_id,
      therapist_id: orig.therapist_id,
      event_type: orig.event_type,
      service_type: orig.service_type,
      modality: orig.modality,
      starts_at: newStartsAt,
      ends_at: newEndsAt,
      status: 'scheduled',
      parent_appointment_id: appointmentId,
      notes: orig.notes,
      is_extra: orig.is_extra ?? false,
      extra_reason: orig.is_extra ? (orig.extra_reason ?? null) : null,
      created_by_user_id: ctx.appUser.id,
    })
    .select('id')
    .single()
  if (insErr || !created) {
    // Rollback
    await supabase.from('appointments').update({ status: orig.status }).eq('id', appointmentId)
    return { ok: false, error: insErr?.message ?? 'Error al reagendar' }
  }

  revalidatePath('/agenda')
  return { ok: true, newAppointmentId: created.id }
}

export async function cancelAppointment(
  appointmentId: string,
  reason: 'late_cancel' | 'no_show' | 'sick' | 'other' = 'other',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  // Mapping de reason → status final
  const status: AppointmentStatus = reason === 'late_cancel' ? 'late_cancel' : reason === 'no_show' ? 'no_show' : 'late_cancel'

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status, notes: reason === 'sick' ? 'Cancelada por enfermedad' : null })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/agenda')
  return { ok: true }
}

export async function markAppointmentInProgress(
  appointmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  const supabase = await createClient()

  // Bloqueo: no abrir otra terapia si hay un niño finalizado sin despachar.
  // (La terapista/maestra debe despachar al anterior primero.)
  const { data: appt } = await supabase
    .from('appointments')
    .select('therapist_id')
    .eq('id', appointmentId)
    .maybeSingle()
  const therapistId = appt?.therapist_id ?? null
  if (therapistId) {
    const { data: pendingDispatch } = await supabase
      .from('appointments')
      .select('id')
      .eq('therapist_id', therapistId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .is('dispatched_at', null)
      .neq('id', appointmentId)
      .limit(1)
    if (pendingDispatch && pendingDispatch.length > 0) {
      return {
        ok: false,
        error: 'Primero despachá al niño/a de la terapia anterior (marcá que ya fue recogido).',
      }
    }
  }

  return updateAppointmentStatus(appointmentId, 'in_progress')
}

/**
 * Elimina físicamente una cita creada por error. Solo para admin / directora,
 * y solo si la cita aún está 'scheduled' o 'rescheduled' (no la usamos en
 * citas con historial como completed / no_show / late_cancel, para preservar
 * la trazabilidad de inasistencias reales).
 *
 * Las FKs con ON DELETE CASCADE limpian: therapy_sessions, session_reports,
 * appointment_absences, virtual_meetings. Las FKs con SET NULL desvinculan
 * child_journal_entries.
 */
export async function deleteAppointment(
  appointmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  if (!['admin', 'directora'].includes(ctx.appUser.role)) {
    return { ok: false, error: 'Solo admin o directora pueden eliminar citas creadas por error.' }
  }

  const supabase = await createClient()

  // Validar estado (no permitir eliminar historial real)
  const { data: appt } = await supabase
    .from('appointments')
    .select('status')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (!['scheduled', 'rescheduled', 'replacement'].includes(appt.status)) {
    return {
      ok: false,
      error: 'Solo se pueden eliminar citas que aún no se realizaron. Para no-shows o cancelaciones tardías usá "Cancelar cita" — eso preserva el historial.',
    }
  }

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true }
}

export async function markAppointmentCompleted(
  appointmentId: string,
  notes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'completed', completed_at: new Date().toISOString(), notes: notes?.trim() || null })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true }
}

/** Roles de gestión que pueden marcar terapias como extraordinarias (is_extra). */
const MGMT_ROLES_EXTRA = ['admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias', 'recepcion']

/**
 * Marca/desmarca una terapia completada como extraordinaria (`is_extra`). Las
 * extraordinarias entran a la planilla de servicios profesionales. Pensado para
 * recepción/coordinadoras/admin desde la vista de horas completadas.
 */
export async function setAppointmentExtra(
  appointmentId: string,
  isExtra: boolean,
  reason: ExtraReason | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (!MGMT_ROLES_EXTRA.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para marcar terapias extraordinarias' }
  }

  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('event_type')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.event_type !== 'terapia') {
    return { ok: false, error: 'Solo las terapias pueden marcarse como extraordinarias.' }
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      is_extra: isExtra,
      extra_reason: isExtra ? reason : null,
    })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/operacion/capacidad-terapistas/completadas')
  revalidatePath('/reportes/por-terapista')
  revalidatePath('/agenda')
  return { ok: true }
}

async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ status }).eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/agenda')
  return { ok: true }
}
