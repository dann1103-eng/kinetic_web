/**
 * my-children — niños que un terapista/maestra puede ver en /mis-ninos.
 *
 * Regla (maestras = terapistas, mismas restricciones): YA NO hay "terapista
 * principal". El niño aparece en "mis niños" del usuario si:
 *   (a) el usuario es la terapista asignada de alguna terapia activa del plan
 *       (treatment_plans.therapies_json[].therapist_id), o
 *   (b) el usuario es staff de un grupo de programa matutino al que el niño
 *       pertenece.
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

  // (a) Niños donde el usuario es la terapista asignada de alguna terapia activa
  //     del plan (therapies_json[*].therapist_id). Única fuente de verdad de la
  //     asignación — ya no existe "terapista principal".
  const { data: allActivePlans } = await supabase
    .from('treatment_plans')
    .select('child_id, therapies_json')
    .eq('active', true)
  for (const plan of allActivePlans ?? []) {
    const therapies = (plan.therapies_json ?? []) as { therapist_id?: string | null; active?: boolean }[]
    for (const t of therapies) {
      if (t.therapist_id === userId && t.active !== false) {
        childIdSet.add(plan.child_id as string)
        break
      }
    }
  }

  // (b) Programas matutinos: niños de los grupos donde el usuario es staff
  //     (grupos compartidos — visibilidad por grupo, no por terapista principal).
  const { data: staffGroups } = await supabase
    .from('program_group_staff')
    .select('group_id')
    .eq('user_id', userId)
  const groupIds = (staffGroups ?? []).map((g) => g.group_id as string)
  if (groupIds.length > 0) {
    const { data: members } = await supabase
      .from('program_group_members')
      .select('child_id')
      .in('group_id', groupIds)
      .eq('active', true)
    for (const m of members ?? []) childIdSet.add(m.child_id as string)
  }

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

  // Traemos TODAS las citas de estos niños (sin filtrar por terapista): el
  // terapista principal debe ver las terapias de sus niños aunque otra persona
  // lo haya cubierto / hecho una reposición. La visibilidad de QUÉ niños ve no
  // cambia (se resolvió arriba); esto solo amplía QUÉ citas de esos niños trae.
  const apptQuery = supabase
    .from('appointments')
    .select('id, child_id, therapist_id, starts_at, ends_at, service_type, status, event_type')
    .in('child_id', activeIds)
    .gte('starts_at', sixtyDaysAgo)
    .lte('starts_at', sixtyDaysAhead)
    .order('starts_at', { ascending: true })

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

  // (a) Terapista asignada de alguna terapia activa del plan del niño.
  const { data: planWithTherapies } = await supabase
    .from('treatment_plans')
    .select('therapies_json')
    .eq('child_id', childId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (planWithTherapies) {
    const therapies = (planWithTherapies.therapies_json ?? []) as { therapist_id?: string | null; active?: boolean }[]
    if (therapies.some((t) => t.therapist_id === userId && t.active !== false)) return true
  }

  // (b) Programa matutino: el niño es miembro activo de un grupo que el usuario cubre.
  const { data: staffGroups } = await supabase
    .from('program_group_staff')
    .select('group_id')
    .eq('user_id', userId)
  const groupIds = (staffGroups ?? []).map((g) => g.group_id as string)
  if (groupIds.length > 0) {
    const { data: member } = await supabase
      .from('program_group_members')
      .select('id')
      .eq('child_id', childId)
      .eq('active', true)
      .in('group_id', groupIds)
      .limit(1)
      .maybeSingle()
    if (member) return true
  }
  return false
}
