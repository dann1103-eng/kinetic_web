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
import { fetchMorningAttendanceByChild } from '@/lib/domain/morning-attendance'
import { fetchAllPaged } from '@/lib/supabase/paged'

const TZ = 'America/El_Salvador'

export interface NinoCardData {
  child: Child
  plan: TreatmentPlan | null
  /**
   * Asistencia del mes: terapias individuales + programas matutinos (la lista
   * de grupo). `null` = el niño no tenía nada agendado ese mes.
   */
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
 * Carga todo lo que necesita la grilla de /ninos: primero los niños, y con sus
 * ids en mano el resto en paralelo:
 * 1. Todos los niños (ordenados por apellido)
 * 2. Planes de tratamiento
 * 3. Citas individuales del mes (asistencia de terapias)
 * 4. Ciclos, para el chip de "Último pago"
 * 5. Membresías de grupos matutinos (para el filtro por terapista)
 * 6. Asistencia de programas matutinos (la otra mitad de la barra)
 *
 * La barra de asistencia suma las dos cosas: las terapias individuales, que
 * viven en `appointments`, y los programas matutinos, cuya lista se pasa por
 * grupo y vive en otras tablas. Un niño de solo BlueKids no tiene ninguna cita
 * individual, así que sin el punto 6 su tarjeta queda vacía.
 */
export async function getNinosDashboardData(
  supabase: SupabaseClient<Database>,
  periodMonth: string, // 'YYYY-MM'
  includeArchived = false,
): Promise<NinosDashboardResult> {
  const { startISO, endISO } = monthBoundsForPeriod(periodMonth)

  // 1. Niños (por defecto excluye los archivados — mig 0166).
  const childrenRaw = await fetchAllPaged<Child>(() => {
    const q = supabase.from('children').select('*').order('id')
    return includeArchived ? q : q.is('archived_at', null)
  }, 'children')

  // Orden alfabético por apellido (apellido paterno) del nombre completo.
  const children = childrenRaw
    .slice()
    .sort((a, b) => compareByLastName(a.full_name, b.full_name))
  if (children.length === 0) return { niños: [], therapists: [] }

  const childIds = children.map((c) => c.id)

  // 2-6 en paralelo.
  //
  // Todas las lecturas que crecen con la cantidad de niños o de meses van
  // paginadas: PostgREST corta cada respuesta en 1000 filas sin dar error, y
  // esto ya dejó todas las barras en cero una vez (ver fetchAllPaged).
  const [plans, appts, cycles, groupMembersRaw, morningByChild] = await Promise.all([
    fetchAllPaged<TreatmentPlan>(
      () => supabase.from('treatment_plans').select('*').in('child_id', childIds).order('id'),
      'treatment_plans',
    ),
    // `programa_matutino` se excluye acá porque la asistencia de los programas
    // se cuenta aparte, desde las sesiones de grupo (morningByChild, más
    // abajo). Sumar ambas la duplicaría: regenerateMorningAppointments
    // (monthly-cycles.ts) sigue creando una cita por-niño además de la sesión
    // de grupo real. Mismo patrón de exclusión que ya usan
    // mi-dia/capacidad-terapistas/therapist-capacity.ts.
    fetchAllPaged<{ child_id: string; status: string }>(
      () =>
        supabase
          .from('appointments')
          .select('child_id, status')
          .in('child_id', childIds)
          .neq('event_type', 'programa_matutino')
          // Los estados que no cuentan se descartan en la CONSULTA, no en el
          // bucle: traerlos solo para tirarlos gastaba el cupo de filas.
          .not('status', 'in', '(rescheduled,cancelled)')
          .gte('starts_at', startISO)
          .lt('starts_at', endISO)
          .order('id'),
      'appointments',
    ),
    fetchAllPaged<MonthlySessionCycle>(
      () =>
        supabase
          .from('monthly_session_cycles')
          .select('*')
          .in('child_id', childIds)
          .neq('status', 'cancelled')
          .order('period_month', { ascending: false })
          // Desempate estable: period_month se repite entre niños y sin una
          // columna única las páginas podrían repetir u omitir filas.
          .order('id'),
      'monthly_session_cycles',
    ),
    // Grupos matutinos activos del niño — los programas matutinos no llevan
    // terapista individual (mig 0180: primary_therapist_id siempre null en
    // un plan 100% matutino), la cobertura es por staff del grupo.
    fetchAllPaged<{ child_id: string; group_id: string }>(
      () =>
        supabase
          .from('program_group_members')
          .select('child_id, group_id')
          .in('child_id', childIds)
          .eq('active', true)
          .order('id'),
      'program_group_members',
    ),
    // Asistencia de programas matutinos (BlueKids, Learning Kids, Aula
    // Educativa). No vive en `appointments`: son sesiones de grupo con lista
    // pasada (program_group_sessions + program_session_attendance).
    fetchMorningAttendanceByChild(supabase, childIds, startISO, endISO),
  ])

  // Staff de cada grupo matutino referenciado (para unir con los terapistas
  // del plan más abajo) — mismo patrón que listMyChildren (my-children.ts).
  const groupIdsByChild = new Map<string, string[]>()
  const allGroupIds = new Set<string>()
  for (const m of groupMembersRaw) {
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
  for (const p of plans) {
    const existing = plansByChild.get(p.child_id)
    if (!existing || p.active) plansByChild.set(p.child_id, p)
  }

  // Asistencia del mes por niño (citas individuales)
  const attendanceByChild = new Map<string, { completed: number; total: number }>()
  for (const a of appts) {
    if (a.status === 'rescheduled' || a.status === 'cancelled') continue // no cuentan para asistencia
    const curr = attendanceByChild.get(a.child_id) ?? { completed: 0, total: 0 }
    curr.total++
    if (a.status === 'completed') curr.completed++
    attendanceByChild.set(a.child_id, curr)
  }

  // Se suma la asistencia de los programas matutinos. Un niño de BlueKids,
  // Learning Kids o Aula Educativa no tiene citas individuales por su programa:
  // asiste a la jornada y la miss pasa lista por grupo. Sin esto su tarjeta
  // decía "Sin sesiones este mes" aunque hubiera venido todo el mes, y el número
  // no cuadraba con el del panel del niño, que sí la suma (child-dashboard.ts).
  for (const [childId, m] of morningByChild) {
    if (m.total === 0) continue
    const curr = attendanceByChild.get(childId) ?? { completed: 0, total: 0 }
    curr.completed += m.present
    curr.total += m.total
    attendanceByChild.set(childId, curr)
  }

  // Último ciclo por niño (ya vienen ordenados desc por period_month)
  const lastCycleByChild = new Map<string, MonthlySessionCycle>()
  for (const c of cycles) {
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
