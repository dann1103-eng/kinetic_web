/**
 * my-children — niños que un terapista/maestra puede ver en /mis-ninos.
 *
 * Reglas:
 *   • Terapista: niños donde es primary_therapist_id en algún treatment_plan
 *     activo. Excluye fases terminales (5_*).
 *   • Maestra: niños con enrolled_program (blue_kids / learning_kids / aula_educativa).
 *     Las maestras llevan programa matutino, no terapias individuales.
 *
 * En ambos casos devolvemos un subset minimal del Child + la última cita
 * conocida + el próximo appointment programado para mostrar en cards.
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
  // ── 1. Resolver IDs de niños visibles según rol ─────────────────────────
  let childIds: string[] = []

  if (role === 'terapista') {
    const { data: plans } = await supabase
      .from('treatment_plans')
      .select('child_id')
      .eq('primary_therapist_id', userId)
      .eq('active', true)
    childIds = (plans ?? []).map((p) => p.child_id as string)
  } else if (role === 'maestra') {
    // Maestra ve TODOS los niños inscritos en programa matutino.
    const { data: kids } = await supabase
      .from('children')
      .select('id')
      .not('enrolled_program', 'is', null)
    childIds = (kids ?? []).map((k) => k.id as string)
  } else {
    return []
  }

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
    const code = (c as { current_phase_code: string | null }).current_phase_code
    return !code || !code.startsWith('5_')
  })
  const activeIds = activeChildren.map((c) => (c as { id: string }).id)

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

  if (role === 'terapista') {
    apptQuery = apptQuery.eq('therapist_id', userId)
  } else if (role === 'maestra') {
    apptQuery = apptQuery.eq('event_type', 'programa_matutino')
  }

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
    const childId = (c as { id: string }).id
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
      child: c as MyChildCard['child'],
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
  if (role === 'terapista') {
    const { data } = await supabase
      .from('treatment_plans')
      .select('id')
      .eq('primary_therapist_id', userId)
      .eq('child_id', childId)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    return !!data
  }
  if (role === 'maestra') {
    const { data } = await supabase
      .from('children')
      .select('id, enrolled_program')
      .eq('id', childId)
      .not('enrolled_program', 'is', null)
      .limit(1)
      .maybeSingle()
    return !!data
  }
  return false
}
