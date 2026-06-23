/**
 * my-children — niños que un terapista/maestra puede ver en /mis-ninos.
 *
 * Regla (maestras = terapistas, mismas restricciones): niños donde el usuario es
 * primary_therapist_id en algún treatment_plan activo (sus niños asignados).
 * Una maestra solo ve los niños del programa matutino que tiene asignados como
 * terapista principal — NO todos los del programa.
 * Se excluyen fases terminales (5_*).
 *
 * Devolvemos un subset minimal del Child + la última cita conocida + el próximo
 * appointment programado para mostrar en cards.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Child, Appointment } from '@/types/db'

export interface MyChildCard {
  child: Pick<
    Child,
    | 'id'
    | 'family_id'
    | 'full_name'
    | 'preferred_name'
    | 'photo_url'
    | 'birth_date'
    | 'diagnoses_display_text'
    | 'diagnoses_json'
    | 'enrolled_program'
    | 'current_phase_code'
  >
  /** Próxima cita programada con este terapista (futuro inmediato). */
  nextAppointment: Pick<Appointment, 'id' | 'starts_at' | 'ends_at' | 'service_type' | 'status'> | null
  /** Última cita completada con este terapista. */
  lastCompletedAppointment: Pick<Appointment, 'id' | 'starts_at' | 'ends_at' | 'service_type'> | null
}

/**
 * Devuelve los niños visibles para el rol dado.
 *
 * @param supabase server client (RLS aplicado)
 * @param userId   id del terapista/maestra
 * @param role     rol del usuario actual
 */
export async function listMyChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
  role: string,
): Promise<MyChildCard[]> {
  // ── 1. Resolver IDs de niños visibles (UNIÓN de reglas) ─────────────────
  if (role !== 'terapista' && role !== 'maestra') return []
  const childIdSet = new Set<string>()

  // Niños donde es terapista principal de un plan activo — aplica a terapistas
  // Y maestras por igual (mismas restricciones: solo sus asignados).
  const { data: plans } = await supabase
    .from('treatment_plans')
    .select('child_id')
    .eq('primary_therapist_id', userId)
    .eq('active', true)
  for (const p of plans ?? []) childIdSet.add(p.child_id as string)

  const childIds = [...childIdSet]
  if (childIds.length === 0) return []

  // ── 2. Cargar datos básicos de los niños ────────────────────────────────
  const { data: childrenRaw } = await supabase
    .from('children')
    .select(
      'id, family_id, full_name, preferred_name, photo_url, birth_date, ' +
        'diagnoses_display_text, diagnoses_json, enrolled_program, current_phase_code',
    )
    .in('id', childIds)
    .order('full_name')

  if (!childrenRaw || childrenRaw.length === 0) return []

  // Filtrar fases terminales (5_*) — no mostrar niños dados de alta o retirados
  const activeChildren = childrenRaw.filter((c) => {
    const code = (c as unknown as { current_phase_code: string | null }).current_phase_code
    return !code || !code.startsWith('5_')
  })
  const activeIds = activeChildren.map((c) => (c as unknown as { id: string }).id)

  if (activeIds.length === 0) return []

  // ── 3. Cargar appointments relevantes (filtrar por terapista si aplica) ─
  const now = new Date().toISOString()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const sixtyDaysAhead = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  let apptQuery = supabase
    .from('appointments')
    .select('id, child_id, therapist_id, starts_at, ends_at, service_type, status, event_type')
    .in('child_id', activeIds)
    .gte('starts_at', sixtyDaysAgo)
    .lte('starts_at', sixtyDaysAhead)
    .order('starts_at', { ascending: true })

  // Terapista y maestra: solo sus propias citas (mismas restricciones).
  apptQuery = apptQuery.eq('therapist_id', userId)

  const { data: apptsRaw } = await apptQuery
  type ApptRow = {
    id: string
    child_id: string
    therapist_id: string | null
    starts_at: string
    ends_at: string
    service_type: string | null
    status: string
    event_type: string
  }
  const appts = (apptsRaw ?? []) as ApptRow[]

  // ── 4. Indexar appointments por niño ────────────────────────────────────
  const apptsByChild = new Map<string, ApptRow[]>()
  for (const a of appts) {
    if (!apptsByChild.has(a.child_id)) apptsByChild.set(a.child_id, [])
    apptsByChild.get(a.child_id)!.push(a)
  }

  // ── 5. Combinar ─────────────────────────────────────────────────────────
  return activeChildren.map((c) => {
    const childId = (c as unknown as { id: string }).id
    const childAppts = apptsByChild.get(childId) ?? []

    const nextAppt =
      childAppts.find(
        (a) => a.starts_at >= now && (a.status === 'scheduled' || a.status === 'in_progress' || a.status === 'replacement'),
      ) ?? null

    // último completed (escaneamos hacia atrás)
    let lastCompleted: ApptRow | null = null
    for (let i = childAppts.length - 1; i >= 0; i--) {
      if (childAppts[i].status === 'completed') {
        lastCompleted = childAppts[i]
        break
      }
    }

    return {
      child: c as unknown as MyChildCard['child'],
      nextAppointment: nextAppt
        ? {
            id: nextAppt.id,
            starts_at: nextAppt.starts_at,
            ends_at: nextAppt.ends_at,
            service_type: nextAppt.service_type as Appointment['service_type'],
            status: nextAppt.status as Appointment['status'],
          }
        : null,
      lastCompletedAppointment: lastCompleted
        ? {
            id: lastCompleted.id,
            starts_at: lastCompleted.starts_at,
            ends_at: lastCompleted.ends_at,
            service_type: lastCompleted.service_type as Appointment['service_type'],
          }
        : null,
    }
  })
}

/** Verifica si el usuario actual (terapista/maestra) tiene permiso de ver un niño específico. */
export async function userCanViewChild(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
  role: string,
  childId: string,
): Promise<boolean> {
  if (role !== 'terapista' && role !== 'maestra') return false

  // Terapista principal de un plan activo de ese niño — terapistas Y maestras
  // por igual (mismas restricciones: solo sus asignados).
  const { data: plan } = await supabase
    .from('treatment_plans')
    .select('id')
    .eq('primary_therapist_id', userId)
    .eq('child_id', childId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  return !!plan
}
