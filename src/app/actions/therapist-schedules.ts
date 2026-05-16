'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { TherapistWorkScheduleBlock } from '@/types/db'

const ADMIN_ROLES = ['admin', 'directora'] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
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
  const { supabase, user } = await getActor()
  if (!isAdmin(user.role)) {
    return { ok: false, error: 'Solo admin/directora pueden editar horarios.' }
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

  const query = input.id
    ? supabase.from('therapist_work_schedule').update(payload).eq('id', input.id).select('*').single()
    : supabase.from('therapist_work_schedule').insert(payload).select('*').single()

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
  const { supabase, user } = await getActor()
  if (!isAdmin(user.role)) {
    return { ok: false, error: 'Solo admin/directora pueden editar horarios.' }
  }

  const { error } = await supabase
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

export async function setMaxHoursPerWeek(
  therapistId: string,
  hours: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isAdmin(user.role)) {
    return { ok: false, error: 'Solo admin/directora pueden editar horarios.' }
  }
  if (hours != null && (hours < 0 || hours > 100)) {
    return { ok: false, error: 'Horas semanales fuera de rango (0-100).' }
  }

  const { error } = await supabase
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
