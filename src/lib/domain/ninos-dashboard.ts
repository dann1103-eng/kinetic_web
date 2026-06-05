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
): Promise<NinosDashboardResult> {
  const { startISO, endISO } = monthBoundsForPeriod(periodMonth)

  // 1. Niños
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('*')

  // Orden alfabético por apellido (apellido paterno) del nombre completo.
  const children = ((childrenRaw ?? []) as Child[])
    .slice()
    .sort((a, b) => compareByLastName(a.full_name, b.full_name))
  if (children.length === 0) return { niños: [], therapists: [] }

  const childIds = children.map((c) => c.id)

  // 2-4 en paralelo
  const [{ data: plansRaw }, { data: apptsRaw }, { data: cyclesRaw }] = await Promise.all([
    supabase.from('treatment_plans').select('*').in('child_id', childIds),
    supabase
      .from('appointments')
      .select('child_id, status')
      .in('child_id', childIds)
      .gte('starts_at', startISO)
      .lt('starts_at', endISO),
    supabase
      .from('monthly_session_cycles')
      .select('*')
      .in('child_id', childIds)
      .neq('status', 'cancelled')
      .order('period_month', { ascending: false }),
  ])

  // Plan activo por niño (activo primero; si no hay activo, el más reciente)
  const plansByChild = new Map<string, TreatmentPlan>()
  for (const p of (plansRaw ?? []) as TreatmentPlan[]) {
    const existing = plansByChild.get(p.child_id)
    if (!existing || p.active) plansByChild.set(p.child_id, p)
  }

  // Asistencia del mes por niño
  const attendanceByChild = new Map<string, { completed: number; total: number }>()
  for (const a of (apptsRaw ?? []) as { child_id: string; status: string }[]) {
    if (a.status === 'rescheduled') continue // no cuenta para asistencia
    const curr = attendanceByChild.get(a.child_id) ?? { completed: 0, total: 0 }
    curr.total++
    if (a.status === 'completed') curr.completed++
    attendanceByChild.set(a.child_id, curr)
  }

  // Último ciclo por niño (ya vienen ordenados desc por period_month)
  const lastCycleByChild = new Map<string, MonthlySessionCycle>()
  for (const c of (cyclesRaw ?? []) as MonthlySessionCycle[]) {
    if (!lastCycleByChild.has(c.child_id)) lastCycleByChild.set(c.child_id, c)
  }

  // Terapistas por niño (principal + por terapia) + set global referenciado.
  const therapistIdsByChild = new Map<string, string[]>()
  const allTherapistIds = new Set<string>()
  for (const child of children) {
    const ids = therapistIdsForPlan(plansByChild.get(child.id) ?? null)
    therapistIdsByChild.set(child.id, ids)
    for (const id of ids) allTherapistIds.add(id)
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
