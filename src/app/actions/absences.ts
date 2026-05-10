'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { isAbsenceExpired, REPLACEMENT_WINDOW_DAYS } from '@/lib/domain/absence'
import {
  suggestReplacementSlots,
  type SuggestedSlot,
} from '@/lib/domain/replacement-suggestions'
import { defaultDurationMinutes } from '@/lib/domain/appointment'
import type { Appointment, AppointmentAbsence, InstitutionalClosure } from '@/types/db'

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

  // Validar que la ausencia no esté vencida (>30 días desde el reporte).
  const { data: absenceRow } = await supabase
    .from('appointment_absences')
    .select('reported_at, status')
    .eq('id', input.absenceId)
    .single()
  if (!absenceRow) return { ok: false, error: 'Solicitud no encontrada.' }
  if (absenceRow.status !== 'pending') {
    return { ok: false, error: 'Esta solicitud ya fue resuelta.' }
  }
  if (isAbsenceExpired(absenceRow.reported_at)) {
    return {
      ok: false,
      error: `La ventana de ${REPLACEMENT_WINDOW_DAYS} días para reponer ya venció. Marcala como "no reponer".`,
    }
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

// ── Sugerencias de slots para reposición ───────────────────────────────────

const SUGGESTION_WINDOW_DAYS = 14

export interface ReplacementSuggestion extends SuggestedSlot {
  /** Duración en minutos del slot, igual a la cita original. */
  durationMinutes: number
}

export async function getReplacementSuggestions(
  absenceId: string,
): Promise<
  | { ok: true; suggestions: ReplacementSuggestion[]; therapistId: string | null }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()

  const { data: absence } = await supabase
    .from('appointment_absences')
    .select('therapist_id, appointment_id')
    .eq('id', absenceId)
    .single()

  if (!absence) return { ok: false, error: 'Solicitud no encontrada.' }
  if (!absence.therapist_id) {
    return { ok: false, error: 'La inasistencia no tiene terapista asociado.' }
  }

  const { data: original } = await supabase
    .from('appointments')
    .select('event_type, starts_at, ends_at')
    .eq('id', absence.appointment_id)
    .single()

  const durationMinutes = original
    ? Math.max(
        15,
        Math.round(
          (new Date(original.ends_at).getTime() - new Date(original.starts_at).getTime()) / 60000,
        ),
      )
    : defaultDurationMinutes('terapia')

  const now = new Date()
  const windowStart = now.toISOString()
  const windowEnd = new Date(
    now.getTime() + SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: existingRaw } = await supabase
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('therapist_id', absence.therapist_id)
    .neq('status', 'rescheduled')
    .neq('status', 'no_show')
    .neq('status', 'late_cancel')
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd)

  const { data: closuresRaw } = await supabase
    .from('institutional_calendar')
    .select('*')

  const suggestions = suggestReplacementSlots({
    existingAppointments: existingRaw ?? [],
    closures: (closuresRaw ?? []) as InstitutionalClosure[],
    durationMinutes,
    windowStart,
    windowEnd,
    limit: 8,
  })

  return {
    ok: true,
    therapistId: absence.therapist_id,
    suggestions: suggestions.map((s) => ({ ...s, durationMinutes })),
  }
}
