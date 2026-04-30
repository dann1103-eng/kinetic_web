import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveTimer {
  entryId: string
  startedAt: number
  title: string
  phase: string
}

export const TIMER_KEY = (reqId: string, userId: string) => `fm_crm_timer_${reqId}_${userId}`

export function getActiveTimer(requirementId: string, userId: string): ActiveTimer | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(TIMER_KEY(requirementId, userId))
    return raw ? (JSON.parse(raw) as ActiveTimer) : null
  } catch {
    return null
  }
}

export async function startTimer(
  supabase: SupabaseClient,
  params: {
    requirementId: string
    userId: string
    title: string
    phase: string
  }
): Promise<{ timer: ActiveTimer | null; error: string | null }> {
  const title = params.title.trim()
  if (!title) return { timer: null, error: 'Falta el título del timer.' }

  // Verificar que el usuario tenga una jornada activa antes de registrar tiempo
  const { data: activeShift } = await supabase
    .from('work_sessions')
    .select('id')
    .eq('user_id', params.userId)
    .is('ended_at', null)
    .maybeSingle()
  if (!activeShift) {
    return { timer: null, error: 'Inicia tu jornada laboral antes de registrar tiempo en un requerimiento.' }
  }

  const startedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      requirement_id: params.requirementId,
      entry_type: 'requirement',
      user_id: params.userId,
      phase: params.phase,
      title,
      started_at: startedAt,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { timer: null, error: 'Ya tienes un timer activo en otro lugar. Detenlo primero.' }
  }

  const timer: ActiveTimer = {
    entryId: data.id,
    startedAt: new Date(startedAt).getTime(),
    title,
    phase: params.phase,
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(TIMER_KEY(params.requirementId, params.userId), JSON.stringify(timer))
  }
  return { timer, error: null }
}

/**
 * Limpia todas las claves de localStorage de timers que pertenecen al usuario dado.
 * Útil cuando `stopActiveEntry()` se llama desde fuera de QuickTimerDialog
 * (e.g. force-logout, finalizar jornada) para evitar que aparezcan timers "fantasma"
 * al regresar de una pausa o en el próximo login.
 */
export function clearAllTimerKeysForUser(userId: string): void {
  if (typeof window === 'undefined') return
  const prefix = 'fm_crm_timer_'
  const suffix = `_${userId}`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix) && key.endsWith(suffix)) {
      toRemove.push(key)
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k))
}

export async function stopTimer(
  supabase: SupabaseClient,
  params: {
    timer: ActiveTimer
    requirementId: string
    userId: string
  }
): Promise<{ error: string | null }> {
  const endedAt = new Date()
  const durationSeconds = Math.floor((endedAt.getTime() - params.timer.startedAt) / 1000)
  const { error } = await supabase
    .from('time_entries')
    .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds })
    .eq('id', params.timer.entryId)
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TIMER_KEY(params.requirementId, params.userId))
  }
  return { error: error ? error.message : null }
}
