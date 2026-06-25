'use server'

import { revalidatePath } from 'next/cache'
import { fromZonedTime } from 'date-fns-tz'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkSession, WorkSessionBreak } from '@/types/db'

const TZ = 'America/El_Salvador'

// Roles que pueden administrar las jornadas (turnos marcados) de cualquier persona.
const ADMIN_ROLES = new Set(['admin', 'directora', 'recepcion'])

export type JornadaGranularity = 'dia' | 'mes'

function resolveWindow(
  granularity: JornadaGranularity,
  anchorDate: string,
): { startISO: string; endISO: string } {
  const [y, m, d] = anchorDate.split('-').map(Number)
  if (granularity === 'dia') {
    return {
      startISO: fromZonedTime(new Date(y, m - 1, d, 0, 0, 0), TZ).toISOString(),
      endISO: fromZonedTime(new Date(y, m - 1, d + 1, 0, 0, 0), TZ).toISOString(),
    }
  }
  return {
    startISO: fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString(),
    endISO: fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString(),
  }
}

/** total = (salida − entrada) − Σ pausas cerradas, en segundos. */
function totalSecondsFor(startedISO: string, endedISO: string, breaks: WorkSessionBreak[]): number {
  const elapsed = Math.round((new Date(endedISO).getTime() - new Date(startedISO).getTime()) / 1000)
  const breaksSec = breaks.reduce((s, b) => {
    if (!b.ended_at) return s
    return s + Math.round((new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 1000)
  }, 0)
  return Math.max(0, elapsed - breaksSec)
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (!ADMIN_ROLES.has(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para administrar jornadas del equipo' }
  }
  return { ok: true }
}

export async function listUserWorkSessions(
  userId: string,
  granularity: JornadaGranularity,
  anchorDate: string,
): Promise<{ ok: true; sessions: WorkSession[] } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  const { startISO, endISO } = resolveWindow(granularity, anchorDate)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('work_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', startISO)
    .lt('started_at', endISO)
    .order('started_at', { ascending: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, sessions: (data ?? []) as WorkSession[] }
}

export interface AdminWorkSessionInput {
  id?: string
  userId: string
  startedAtISO: string
  endedAtISO: string
  notes?: string | null
}

export async function adminUpsertWorkSession(
  input: AdminWorkSessionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const start = new Date(input.startedAtISO)
  const end = new Date(input.endedAtISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Fechas inválidas.' }
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: 'La salida debe ser posterior a la entrada.' }
  }

  const admin = createAdminClient()

  // Al editar, conservar las pausas existentes para el cálculo del total.
  let breaks: WorkSessionBreak[] = []
  if (input.id) {
    const { data: existing } = await admin
      .from('work_sessions')
      .select('breaks_json')
      .eq('id', input.id)
      .maybeSingle()
    breaks = (existing?.breaks_json ?? []) as WorkSessionBreak[]
  }

  const total = totalSecondsFor(input.startedAtISO, input.endedAtISO, breaks)

  if (input.id) {
    const { error } = await admin
      .from('work_sessions')
      .update({
        started_at: input.startedAtISO,
        ended_at: input.endedAtISO,
        status: 'ended',
        total_seconds: total,
        notes: input.notes ?? null,
      })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await admin.from('work_sessions').insert({
      user_id: input.userId,
      started_at: input.startedAtISO,
      ended_at: input.endedAtISO,
      status: 'ended',
      total_seconds: total,
      notes: input.notes ?? null,
    })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/tiempo')
  return { ok: true }
}

export async function adminDeleteWorkSession(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  const admin = createAdminClient()
  const { error } = await admin.from('work_sessions').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/tiempo')
  return { ok: true }
}
