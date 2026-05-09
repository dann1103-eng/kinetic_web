'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { Appointment, AppointmentAbsence } from '@/types/db'

const MGMT_ROLES = ['admin', 'directora', 'coordinadora_terapias'] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isMgmt(role: string): boolean {
  return (MGMT_ROLES as readonly string[]).includes(role)
}

// ── Marcar inasistencia (terapista o admin) ────────────────────────────────

export async function markAbsence(
  appointmentId: string,
  reason?: string,
): Promise<{ ok: true; absence: AppointmentAbsence } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  const { data, error } = await supabase.rpc('mark_appointment_absence', {
    p_appointment_id: appointmentId,
    p_reason: reason ?? null,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('appointment_not_found')) return { ok: false, error: 'Cita no encontrada.' }
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('invalid_state_for_absence')) {
      return {
        ok: false,
        error: 'La cita no está en un estado donde se pueda marcar inasistencia.',
      }
    }
    return { ok: false, error: 'Error al marcar inasistencia.' }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  return { ok: true, absence: data as AppointmentAbsence }
}

// ── Listado pendientes (directora) ─────────────────────────────────────────

export interface AbsenceRow {
  absence: AppointmentAbsence
  child: { id: string; full_name: string; preferred_name: string | null } | null
  therapist: { id: string; full_name: string } | null
  originalAppointment: Pick<Appointment, 'id' | 'starts_at' | 'ends_at' | 'service_type' | 'modality'> | null
}

export async function listPendingAbsences(): Promise<AbsenceRow[]> {
  const { supabase } = await getActor()

  const { data: absencesRaw } = await supabase
    .from('appointment_absences')
    .select('*')
    .eq('status', 'pending')
    .order('reported_at', { ascending: true })

  const absences = (absencesRaw ?? []) as AppointmentAbsence[]
  if (absences.length === 0) return []

  const childIds = Array.from(new Set(absences.map((a) => a.child_id)))
  const therapistIds = Array.from(
    new Set(absences.map((a) => a.therapist_id).filter(Boolean) as string[]),
  )
  const apptIds = Array.from(new Set(absences.map((a) => a.appointment_id)))

  const [childrenRes, therapistsRes, apptsRes] = await Promise.all([
    childIds.length
      ? supabase.from('children').select('id, full_name, preferred_name').in('id', childIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; preferred_name: string | null }[] }),
    therapistIds.length
      ? supabase.from('users').select('id, full_name').in('id', therapistIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    apptIds.length
      ? supabase
          .from('appointments')
          .select('id, starts_at, ends_at, service_type, modality')
          .in('id', apptIds)
      : Promise.resolve({
          data: [] as Pick<Appointment, 'id' | 'starts_at' | 'ends_at' | 'service_type' | 'modality'>[],
        }),
  ])

  const childMap = new Map(
    (childrenRes.data ?? []).map((c) => [c.id, c]),
  )
  const therapistMap = new Map(
    (therapistsRes.data ?? []).map((t) => [t.id, t]),
  )
  const apptMap = new Map(
    (apptsRes.data ?? []).map((a) => [a.id, a]),
  )

  return absences.map((a) => ({
    absence: a,
    child: a.child_id ? childMap.get(a.child_id) ?? null : null,
    therapist: a.therapist_id ? therapistMap.get(a.therapist_id) ?? null : null,
    originalAppointment: apptMap.get(a.appointment_id) ?? null,
  }))
}

// ── Reagendar (mgmt) ───────────────────────────────────────────────────────

export interface ResolveAbsenceInput {
  absenceId: string
  startsAt: string         // ISO
  endsAt: string           // ISO
  therapistId: string
  modality?: 'presencial' | 'virtual'
  notes?: string | null
}

export async function resolveAbsenceWithReplacement(
  input: ResolveAbsenceInput,
): Promise<{ ok: true; replacement: Appointment } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora pueden reagendar.' }
  }

  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    return { ok: false, error: 'La hora de fin debe ser posterior al inicio.' }
  }

  const { data, error } = await supabase.rpc('resolve_absence_with_replacement', {
    p_absence_id: input.absenceId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_therapist_id: input.therapistId,
    p_modality: input.modality ?? 'presencial',
    p_notes: input.notes ?? null,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('absence_not_found')) return { ok: false, error: 'Solicitud no encontrada.' }
    if (msg.includes('absence_already_resolved')) {
      return { ok: false, error: 'Esta solicitud ya fue resuelta.' }
    }
    if (msg.includes('original_appointment_missing')) {
      return { ok: false, error: 'La cita original ya no existe.' }
    }
    if (msg.includes('invalid_time_range')) {
      return { ok: false, error: 'Rango horario inválido.' }
    }
    return { ok: false, error: 'Error al crear la reposición.' }
  }

  revalidatePath('/aprobaciones')
  revalidatePath('/agenda')
  return { ok: true, replacement: data as Appointment }
}

// ── Waive (mgmt) ───────────────────────────────────────────────────────────

export async function waiveAbsence(
  absenceId: string,
  reason: string,
): Promise<{ ok: true; absence: AppointmentAbsence } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora pueden marcar como no reponer.' }
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
  }

  const { data, error } = await supabase.rpc('waive_absence', {
    p_absence_id: absenceId,
    p_reason: reason.trim(),
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('absence_not_found_or_resolved')) {
      return { ok: false, error: 'Solicitud no encontrada o ya resuelta.' }
    }
    if (msg.includes('reason_too_short')) {
      return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
    }
    return { ok: false, error: 'Error al marcar como no reponer.' }
  }

  revalidatePath('/aprobaciones')
  return { ok: true, absence: data as AppointmentAbsence }
}
