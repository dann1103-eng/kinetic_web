'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { appointmentsOverlap, findClosureAffecting } from '@/lib/domain/appointment'
import type {
  Appointment,
  AppointmentStatus,
  EventType,
  Modality,
  ServiceType,
} from '@/types/db'

const STAFF_ROLES_SCHEDULE = ['admin', 'supervisor', 'directora', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion']

interface CreateAppointmentInput {
  child_id: string
  therapist_id?: string | null
  event_type: EventType
  service_type?: ServiceType | null
  modality: Modality
  starts_at: string
  ends_at: string
  notes?: string | null
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

  // Validaciones básicas
  if (!input.child_id) return { ok: false, error: 'Falta el niño/a' }
  if (input.event_type === 'terapia') {
    if (!input.service_type) return { ok: false, error: 'Las terapias requieren tipo de servicio' }
    if (!input.therapist_id) return { ok: false, error: 'Las terapias requieren terapista asignado' }
  }
  if (new Date(input.ends_at).getTime() <= new Date(input.starts_at).getTime()) {
    return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio' }
  }
  const durationMin = (new Date(input.ends_at).getTime() - new Date(input.starts_at).getTime()) / 60_000
  if (durationMin < 15) return { ok: false, error: 'La duración mínima es de 15 minutos' }

  const supabase = await createClient()

  // Validar que el niño existe y está activo
  const { data: child } = await supabase
    .from('children')
    .select('id, treatment_status, family_id')
    .eq('id', input.child_id)
    .maybeSingle()
  if (!child) return { ok: false, error: 'Niño/a no encontrado' }
  if (child.treatment_status === 'discharged_final' || child.treatment_status === 'dropped') {
    return { ok: false, error: 'El niño/a ya no está activo en Kinetic' }
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

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      child_id: input.child_id,
      therapist_id: input.therapist_id || null,
      event_type: input.event_type,
      service_type: input.service_type || null,
      modality: input.modality,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes?.trim() || null,
      created_by_user_id: ctx.appUser.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Error desconocido' }

  revalidatePath('/agenda')
  revalidatePath(`/familias/${child.family_id}`)
  return { ok: true, appointmentId: data.id }
}

export async function updateAppointment(
  appointmentId: string,
  patch: Partial<Pick<Appointment, 'starts_at' | 'ends_at' | 'modality' | 'service_type' | 'therapist_id' | 'notes' | 'event_type'>>,
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
  return updateAppointmentStatus(appointmentId, 'in_progress')
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
    .update({ status: 'completed', notes: notes?.trim() || null })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }
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
