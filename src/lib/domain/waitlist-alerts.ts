/**
 * Alertas in-app de lista de espera para la coordinadora.
 * Detecta cuántas familias están esperando por tipo de terapia y cuáles
 * llevan demasiado tiempo en espera con prioridad alta.
 */

import type { Database } from '@/types/db'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface WaitlistSummary {
  serviceType: string
  waitingCount: number
}

export interface WaitlistAlerts {
  totalWaiting: number
  byServiceType: WaitlistSummary[]
  /** Entradas con priority >= 1 esperando > 14 días. */
  urgentStaleCount: number
}

const URGENT_STALE_DAYS = 14

export async function detectWaitlistAlerts(
  supabase: SupabaseClient<Database>,
): Promise<WaitlistAlerts> {
  // "Esperando" = sin scheduled_child_id Y no en fase terminal.
  const { data: waitingRaw } = await supabase
    .from('waitlist_entries')
    .select('requested_service_type, priority, added_at, current_phase_code, scheduled_child_id')
    .is('scheduled_child_id', null)
    .not('current_phase_code', 'in', '(5_1_alta_terapeutica,5_2_retirado)')

  const waiting = (waitingRaw ?? []) as {
    requested_service_type: string
    priority: number
    added_at: string
  }[]

  const byTypeMap = new Map<string, number>()
  let urgentStale = 0
  const now = Date.now()
  const staleThreshold = URGENT_STALE_DAYS * 24 * 60 * 60 * 1000

  for (const e of waiting) {
    byTypeMap.set(
      e.requested_service_type,
      (byTypeMap.get(e.requested_service_type) ?? 0) + 1,
    )
    if (e.priority >= 1) {
      const age = now - new Date(e.added_at).getTime()
      if (age > staleThreshold) urgentStale++
    }
  }

  return {
    totalWaiting: waiting.length,
    byServiceType: Array.from(byTypeMap.entries())
      .map(([serviceType, waitingCount]) => ({ serviceType, waitingCount }))
      .sort((a, b) => b.waitingCount - a.waitingCount),
    urgentStaleCount: urgentStale,
  }
}

export function daysSinceAdded(addedAt: string): number {
  return Math.floor((Date.now() - new Date(addedAt).getTime()) / (24 * 60 * 60 * 1000))
}
