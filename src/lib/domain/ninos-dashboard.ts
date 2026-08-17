/**
 * Datos del dashboard /ninos.
 *
 * Carga en paralelo: niños + planes + asistencia del mes + último ciclo.
 * Diseñado para cargar en un server component con un solo client Supabase.
 */

import { fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Child, TreatmentPlan, MonthlySessionCycle, Database } from '@/types/db'
import { compareByLastName } from '@/lib/domain/name-sort'

const TZ = 'America/El_Salvador'

export interface NinoCardData {
  child: Child
  plan: TreatmentPlan | null
  /** Citas del mes seleccionado (null = no hay datos para ese mes) */
  attendance: { completed: number; total: number } | null
  lastCycle: MonthlySessionCycle | null
  /** IDs de terapistas asignados al niño (principal + por terapia). Para filtrar. */
  therapistIds: string[]
}

export interface NinosDashboardResult {
  niños: NinoCardData[]
  /** Terapistas referenciados por algún plan (para el filtro), ordenados por nombre. */
  therapists: { id: string; full_name: string }[]
}

/** IDs de terapista de un plan: principal + el de cada terapia activa. */
function therapistIdsForPlan(plan: TreatmentPlan | null): string[] {
  if (!plan) return []
  const ids = new Set<string>()
  if (plan.primary_therapist_id) ids.add(plan.primary_therapist_id)
  for (const t of plan.therapies_json ?? []) {
    if (t.therapist_id) ids.add(t.therapist_id)
  }
  return [...ids]
}

/** 'YYYY-MM' → ISO bounds en TZ El Salvador */
export function monthBoundsForPeriod(ym: string): { startISO: string; endISO: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

/** Devuelve los últimos 13 meses (current + 12 anteriores) como 'YYYY-MM' */
export function getAvailableMonths(): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/**
 * Carga todos los datos necesarios para la grilla de /ninos en 3 queries paralelas:
 * 1. Todos los niños (ordenados por nombre)
 * 2. Todos los plans de tratamiento
 * 3. Appointments del mes seleccionado (para calcular asistencia)
 * 4. Últimos ciclos pagados por niño
 */
export async function getNinosDashboardData(
  supabase: SupabaseClient<Database>,
  periodMonth: string, // 'YYYY-MM'
  includeArchived = false,
): Promise<NinosDashboardResult> {
  const { startISO, endISO } = monthBoundsForPeriod(periodMonth)

  // 1. Niños (por defecto excluye los archivados — mig 0166).
  let childrenQuery = supabase.from('children').select('*')
  if (!includeArchived) childrenQuery = childrenQuery.is('archived_at', null)
  const { data: childrenRaw } = await childrenQuery

  // Orden alfabético por apellido (apellido paterno) del nombre completo.
  const children = ((childrenRaw ?? []) as Child[])
    .slice()
    .sort((a, b) => compareByLastName(a.full_name, b.full_name))
  if (children.length === 0) return { niños: [], therapists: [] }

  const childIds = children.map((c) => c.id)

  // 2-4 en paralelo
  const [{ data: plansRaw }, { data: apptsRaw }, { data: cyclesRaw }, { data: groupMembersRaw }] =
    await Promise.all([
      supabase.from('treatment_plans').select('*').in('child_id', childIds),
      // `programa_matutino` se excluye: esta barra mide solo las terapias
      // individuales (ver más abajo). Además, regenerateMorningAppointments
      // (monthly-cycles.ts) sigue creando una cita por-niño además de la sesión
      // de grupo, así que contarlas acá duplicaría. Mismo patrón de exclusión
      // que ya usan mi-dia/capacidad-terapistas/therapist-capacity.ts.
      supabase
        .from('appointments')
        .select('child_id, status')
        .in('child_id', childIds)
        .neq('event_type', 'programa_matutino')
        .gte('starts_at', startISO)
        .lt('starts_at', endISO),
      supabase
        .from('monthly_session_cycles')
        .select('*')
        .in('child_id', childIds)
        .neq('status', 'cancelled')
        .order('period_month', { ascending: false }),
      // Grupos matutinos activos del niño — los programas matutinos no llevan
      // terapista individual (mig 0180: primary_therapist_id siempre null en
      // un plan 100% matutino), la cobertura es por staff del grupo.
      supabase
        .from('program_group_members')
        .select('child_id, group_id')
        .in('child_id', childIds)
        .eq('active', true),
    ])

  // Staff de cada grupo matutino referenciado (para unir con los terapistas
  // del plan más abajo) — mismo patrón que listMyChildren (my-children.ts).
  const groupIdsByChild = new Map<string, string[]>()
  const allGroupIds = new Set<string>()
  for (const m of (groupMembersRaw ?? []) as { child_id: string; group_id: string }[]) {
    allGroupIds.add(m.group_id)
    const arr = groupIdsByChild.get(m.child_id) ?? []
    arr.push(m.group_id)
    groupIdsByChild.set(m.child_id, arr)
  }
  const staffIdsByGroup = new Map<string, string[]>()
  if (allGroupIds.size > 0) {
    const { data: groupStaffRaw } = await supabase
      .from('program_group_staff')
      .select('group_id, user_id')
      .in('group_id', [...allGroupIds])
    for (const gs of (groupStaffRaw ?? []) as { group_id: string; user_id: string }[]) {
      const arr = staffIdsByGroup.get(gs.group_id) ?? []
      arr.push(gs.user_id)
      staffIdsByGroup.set(gs.group_id, arr)
    }
  }

  // Plan activo por niño (activo primero; si no hay activo, el más reciente)
  const plansByChild = new Map<string, TreatmentPlan>()
  for (const p of (plansRaw ?? []) as TreatmentPlan[]) {
    const existing = plansByChild.get(p.child_id)
    if (!existing || p.active) plansByChild.set(p.child_id, p)
  }

  // Asistencia del mes por niño (citas individuales)
  const attendanceByChild = new Map<string, { completed: number; total: number }>()
  for (const a of (apptsRaw ?? []) as { child_id: string; status: string }[]) {
    if (a.status === 'rescheduled' || a.status === 'cancelled') continue // no cuentan para asistencia
    const curr = attendanceByChild.get(a.child_id) ?? { completed: 0, total: 0 }
    curr.total++
    if (a.status === 'completed') curr.completed++
    attendanceByChild.set(a.child_id, curr)
  }

  // Los programas matutinos NO entran en esta barra: funcionan como un colegio
  // (el niño asiste a la jornada, no a sesiones contratadas), y su asistencia se
  // pasa por grupo en /operacion/grupos. Esta barra mide únicamente las terapias
  // individuales de la tarde, que es lo que se contrata por sesión.
  //
  // Antes se sumaba `fetchMorningAttendanceByChild` acá, y un niño de solo
  // programa matutino mostraba una barra que no correspondía a ninguna terapia.

  // Último ciclo por niño (ya vienen ordenados desc por period_month)
  const lastCycleByChild = new Map<string, MonthlySessionCycle>()
  for (const c of (cyclesRaw ?? []) as MonthlySessionCycle[]) {
    if (!lastCycleByChild.has(c.child_id)) lastCycleByChild.set(c.child_id, c)
  }

  // Terapistas por niño (principal + por terapia + staff de su grupo matutino)
  // + set global referenciado.
  const therapistIdsByChild = new Map<string, string[]>()
  const allTherapistIds = new Set<string>()
  for (const child of children) {
    const ids = new Set(therapistIdsForPlan(plansByChild.get(child.id) ?? null))
    for (const groupId of groupIdsByChild.get(child.id) ?? []) {
      for (const staffId of staffIdsByGroup.get(groupId) ?? []) ids.add(staffId)
    }
    const idsArr = [...ids]
    therapistIdsByChild.set(child.id, idsArr)
    for (const id of idsArr) allTherapistIds.add(id)
  }

  // Nombres de los terapistas referenciados (para el dropdown del filtro).
  let therapists: { id: string; full_name: string }[] = []
  if (allTherapistIds.size > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', [...allTherapistIds])
    therapists = ((usersRaw ?? []) as { id: string; full_name: string }[])
      .slice()
      .sort((a, b) => compareByLastName(a.full_name, b.full_name))
  }

  const niños = children.map((child) => ({
    child,
    plan: plansByChild.get(child.id) ?? null,
    attendance: attendanceByChild.get(child.id) ?? null,
    lastCycle: lastCycleByChild.get(child.id) ?? null,
    therapistIds: therapistIdsByChild.get(child.id) ?? [],
  }))

  return { niños, therapists }
}
