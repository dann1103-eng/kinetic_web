/**
 * Despachos pendientes: terapias que ya terminaron y cuyo niño/a aún no se
 * confirma como recogido. Alimenta el pop-up "¿Niño/a sigue ahí?"
 * (`DispatchWatcher`). Vive en el dominio (recibe el cliente) para poder probarse
 * contra el fake de Supabase; la server action solo resuelve el actor.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

export interface PendingDispatch {
  id: string
  child_id: string
  child_name: string
  therapist_id: string | null
  completed_at: string
  snoozed_until: string | null
}

export async function fetchPendingDispatches(
  supabase: SupabaseClient<Database>,
  scope: { actorId: string; seesAll: boolean },
): Promise<PendingDispatch[]> {
  let q = supabase
    .from('appointments')
    .select('id, child_id, therapist_id, completed_at, dispatch_snoozed_until')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .is('dispatched_at', null)
    // Despachar es entregar un NIÑO/A a sus papás. Las citas sin niño registrado
    // (evaluación a una persona nueva, reunión de padres, entrevista, entrega de
    // avances, "otro"; mig 0156) las completa `completeFreePerson`, que también las
    // deja en `completed` + `completed_at`, y nadie las despacha jamás: sin este
    // filtro el pop-up "¿Niño/a sigue ahí?" salía sin nombre a los 15 min.
    .not('child_id', 'is', null)
    // Excluir niños ya entregados a recepción (tienen su propio flujo de tarjeta flotante).
    .or('dispatch_type.is.null,dispatch_type.in.(internal,to_parent)')

  // Terapista/maestra: solo sus citas. Gestión: todas.
  if (!scope.seesAll) {
    q = q.eq('therapist_id', scope.actorId)
  }

  const { data } = await q
  const rows = (data ?? []) as {
    id: string
    child_id: string
    therapist_id: string | null
    completed_at: string
    dispatch_snoozed_until: string | null
  }[]
  if (rows.length === 0) return []

  const childIds = Array.from(new Set(rows.map((r) => r.child_id)))
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .in('id', childIds)
  const nameById = new Map((childrenRaw ?? []).map((c) => [c.id, c.full_name]))

  return rows.map((r) => ({
    id: r.id,
    child_id: r.child_id,
    child_name: nameById.get(r.child_id) ?? 'Niño/a',
    therapist_id: r.therapist_id,
    completed_at: r.completed_at,
    snoozed_until: r.dispatch_snoozed_until,
  }))
}
