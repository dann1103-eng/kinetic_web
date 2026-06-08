'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { TherapistWorkScheduleBlock } from '@/types/db'
import {
  calculateWeeklyOccupancy,
  startOfWeekMonday,
  type WeeklyOccupancy,
} from '@/lib/domain/therapist-capacity'

// Roles que gestionan horarios/capacidad desde /users (Administración).
const SCHEDULE_MGMT_ROLES = ['admin', 'directora', 'recepcion'] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function canManageSchedules(role: string): boolean {
  return (SCHEDULE_MGMT_ROLES as readonly string[]).includes(role)
}

export interface UpsertScheduleBlockInput {
  id?: string
  therapistId: string
  dayOfWeek: number  // 0=dom, 6=sáb
  startTime: string  // "HH:MM"
  endTime: string
  active?: boolean
}

export async function upsertScheduleBlock(
  input: UpsertScheduleBlockInput,
): Promise<{ ok: true; block: TherapistWorkScheduleBlock } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageSchedules(user.role)) {
    return { ok: false, error: 'Sin permisos para editar horarios.' }
  }

  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    return { ok: false, error: 'Día inválido.' }
  }
  if (input.startTime >= input.endTime) {
    return { ok: false, error: 'La hora de fin debe ser posterior al inicio.' }
  }

  const payload = {
    therapist_id: input.therapistId,
    day_of_week: input.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    start_time: input.startTime,
    end_time: input.endTime,
    active: input.active ?? true,
  }

  // Escritura con service role: la autorización ya se validó por rol arriba
  // (las RLS de therapist_work_schedule son admin/directora; recepción pasa por aquí).
  const admin = createAdminClient()
  const query = input.id
    ? admin.from('therapist_work_schedule').update(payload).eq('id', input.id).select('*').single()
    : admin.from('therapist_work_schedule').insert(payload).select('*').single()

  const { data, error } = await query
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo guardar el bloque.' }
  }

  revalidatePath('/operacion/horarios-terapistas')
  revalidatePath('/operacion/capacidad-terapistas')
  return { ok: true, block: data as TherapistWorkScheduleBlock }
}

export async function deleteScheduleBlock(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageSchedules(user.role)) {
    return { ok: false, error: 'Sin permisos para editar horarios.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('therapist_work_schedule')
    .delete()
    .eq('id', id)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/operacion/horarios-terapistas')
  revalidatePath('/operacion/capacidad-terapistas')
  return { ok: true }
}

/**
 * Devuelve la ocupación semanal de un terapista para la semana que contiene
 * `referenceDateIso`. Útil para mostrar carga real (citas) vs horas
 * contractuales (bloques) en el panel de perfil.
 */
export async function getTherapistWeekOccupancy(
  therapistId: string,
  referenceDateIso: string,
): Promise<{ ok: true; data: WeeklyOccupancy; weekStartIso: string } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  // Usuario
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, full_name, max_hours_per_week')
    .eq('id', therapistId)
    .maybeSingle()
  if (userErr || !userRow) {
    return { ok: false, error: userErr?.message ?? 'Usuario no encontrado.' }
  }

  // Ventana semanal (lun 00:00 → dom 23:59 local)
  const ref = new Date(referenceDateIso)
  const weekStart = startOfWeekMonday(ref)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // Bloques laborales activos
  const { data: blocksRaw, error: blocksErr } = await supabase
    .from('therapist_work_schedule')
    .select('*')
    .eq('therapist_id', therapistId)
    .eq('active', true)
  if (blocksErr) return { ok: false, error: blocksErr.message }

  // Citas de la semana del terapista
  const { data: apptsRaw, error: apptsErr } = await supabase
    .from('appointments')
    .select('therapist_id, starts_at, ends_at, status')
    .eq('therapist_id', therapistId)
    .gte('starts_at', weekStart.toISOString())
    .lt('starts_at', weekEnd.toISOString())
  if (apptsErr) return { ok: false, error: apptsErr.message }

  const [occ] = calculateWeeklyOccupancy(
    [{
      id: userRow.id,
      full_name: userRow.full_name ?? '',
      max_hours_per_week: userRow.max_hours_per_week,
    }],
    (blocksRaw ?? []) as TherapistWorkScheduleBlock[],
    apptsRaw ?? [],
    weekStart,
  )

  return { ok: true, data: occ, weekStartIso: weekStart.toISOString() }
}

export async function getUserScheduleBlocks(
  therapistId: string,
): Promise<{ ok: true; blocks: TherapistWorkScheduleBlock[] } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  const { data, error } = await supabase
    .from('therapist_work_schedule')
    .select('*')
    .eq('therapist_id', therapistId)
    .order('day_of_week')
    .order('start_time')
  if (error) return { ok: false, error: error.message }
  return { ok: true, blocks: (data ?? []) as TherapistWorkScheduleBlock[] }
}

export async function setMaxHoursPerWeek(
  therapistId: string,
  hours: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageSchedules(user.role)) {
    return { ok: false, error: 'Sin permisos para editar horarios.' }
  }
  if (hours != null && (hours < 0 || hours > 100)) {
    return { ok: false, error: 'Horas semanales fuera de rango (0-100).' }
  }

  // Service role: actualizar max_hours de OTRO usuario no lo permite la RLS de
  // users ("solo su propio perfil"). La autorización se validó por rol arriba.
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ max_hours_per_week: hours })
    .eq('id', therapistId)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/operacion/horarios-terapistas')
  revalidatePath('/operacion/capacidad-terapistas')
  return { ok: true }
}
