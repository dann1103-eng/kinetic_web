/**
 * Datos agregados para el dashboard global (Ronda 3b).
 * Una función por rol que pre-calcula KPIs + listas cortas.
 *
 * Todas asumen que el caller es agency_user (RLS); cargan desde
 * supabase del request.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const TZ = 'America/El_Salvador'

/** Inicio del mes actual en SV → ISO. */
export function monthBoundsSV(now: Date = new Date()): {
  startISO: string
  endISO: string
  periodLabel: string
} {
  const local = toZonedTime(now, TZ)
  const y = local.getFullYear()
  const m = local.getMonth()
  const start = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(y, m + 1, 1, 0, 0, 0), TZ)
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    periodLabel: local.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' }),
  }
}

export function todayBoundsSV(now: Date = new Date()): {
  startISO: string
  endISO: string
} {
  const local = toZonedTime(now, TZ)
  const start = fromZonedTime(
    new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0),
    TZ,
  )
  const end = fromZonedTime(
    new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1, 0, 0, 0),
    TZ,
  )
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

export function weekAheadISO(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

// ── Mgmt (admin / directora) ───────────────────────────────────────────────

export interface MgmtDashboardData {
  periodLabel: string
  monthlyAppointments: { scheduled: number; completed: number; no_show: number; total: number }
  monthlyRevenueUsd: number
  activeChildren: number
  pendingCounts: {
    progressReports: number
    sessionReports: number
    absences: number
  }
  childrenByIntakePhase: { phase: string; count: number }[]
}

export async function getMgmtDashboardData(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<MgmtDashboardData> {
  const { startISO, endISO, periodLabel } = monthBoundsSV(now)

  // Citas del mes (todas)
  const { data: monthApptsRaw } = await supabase
    .from('appointments')
    .select('id, status')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const monthAppts = monthApptsRaw ?? []
  const counts = { scheduled: 0, completed: 0, no_show: 0, total: monthAppts.length }
  for (const a of monthAppts) {
    if (a.status === 'scheduled' || a.status === 'in_progress') counts.scheduled++
    else if (a.status === 'completed') counts.completed++
    else if (a.status === 'no_show') counts.no_show++
  }

  // Ingresos del mes (cycles generated del mes en curso)
  const { data: cyclesRaw } = await supabase
    .from('monthly_session_cycles')
    .select('payment_amount_usd')
    .eq('status', 'generated')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)
  const monthlyRevenueUsd =
    (cyclesRaw ?? []).reduce((s, c) => s + Number(c.payment_amount_usd ?? 0), 0)

  // Niños activos
  const { count: activeChildrenCount } = await supabase
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('treatment_status', 'active')

  // Pendings: progress_reports submitted, session_reports submitted, absences pending
  const [{ count: progressReportsCount }, { count: sessionReportsCount }, { count: absencesCount }] =
    await Promise.all([
      supabase
        .from('progress_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('session_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('appointment_absences')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

  // Children por intake_phase
  const { data: phaseRaw } = await supabase
    .from('children')
    .select('intake_phase')
    .eq('treatment_status', 'active')
  const phaseMap = new Map<string, number>()
  for (const r of phaseRaw ?? []) {
    phaseMap.set(r.intake_phase, (phaseMap.get(r.intake_phase) ?? 0) + 1)
  }
  const childrenByIntakePhase = Array.from(phaseMap.entries())
    .map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => b.count - a.count)

  return {
    periodLabel,
    monthlyAppointments: counts,
    monthlyRevenueUsd,
    activeChildren: activeChildrenCount ?? 0,
    pendingCounts: {
      progressReports: progressReportsCount ?? 0,
      sessionReports: sessionReportsCount ?? 0,
      absences: absencesCount ?? 0,
    },
    childrenByIntakePhase,
  }
}

// ── Coordinadora terapias ──────────────────────────────────────────────────

export interface CoordTerapiasDashboardData {
  todayCount: number
  weekCount: number
  pendingAbsences: number
  childrenWithoutPlan: { id: string; full_name: string; family_id: string }[]
  childrenWithoutTherapist: { id: string; full_name: string; family_id: string }[]
}

export async function getCoordTerapiasDashboardData(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<CoordTerapiasDashboardData> {
  const todayB = todayBoundsSV(now)
  const weekEndISO = weekAheadISO(now)

  const [{ count: todayCount }, { count: weekCount }, { count: pendingAbsences }] =
    await Promise.all([
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', todayB.startISO)
        .lt('starts_at', todayB.endISO)
        .in('status', ['scheduled', 'in_progress']),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', now.toISOString())
        .lt('starts_at', weekEndISO)
        .in('status', ['scheduled', 'in_progress', 'replacement']),
      supabase
        .from('appointment_absences')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

  // Children activos sin plan o con plan sin terapista
  const { data: activeChildren } = await supabase
    .from('children')
    .select('id, full_name, family_id')
    .eq('treatment_status', 'active')
    .order('full_name')
  const childIds = (activeChildren ?? []).map((c) => c.id)

  let childrenWithoutPlan: { id: string; full_name: string; family_id: string }[] = []
  let childrenWithoutTherapist: { id: string; full_name: string; family_id: string }[] = []

  if (childIds.length > 0) {
    const { data: plansRaw } = await supabase
      .from('treatment_plans')
      .select('child_id, primary_therapist_id, active')
      .in('child_id', childIds)
    const planByChild = new Map(
      (plansRaw ?? []).map((p) => [p.child_id, p]),
    )
    for (const c of activeChildren ?? []) {
      const plan = planByChild.get(c.id)
      if (!plan || !plan.active) {
        childrenWithoutPlan.push(c)
      } else if (!plan.primary_therapist_id) {
        childrenWithoutTherapist.push(c)
      }
    }
  }

  return {
    todayCount: todayCount ?? 0,
    weekCount: weekCount ?? 0,
    pendingAbsences: pendingAbsences ?? 0,
    childrenWithoutPlan: childrenWithoutPlan.slice(0, 10),
    childrenWithoutTherapist: childrenWithoutTherapist.slice(0, 10),
  }
}

// ── Recepcion / Contable ───────────────────────────────────────────────────

export interface RecepcionDashboardData {
  periodLabel: string
  monthlyRevenueUsd: number
  cyclesPaidThisMonth: number
  cyclesCancelledThisMonth: number
  recentCycles: {
    id: string
    period_month: string
    paid_at: string
    payment_amount_usd: number
    payment_method: string | null
    child: { id: string; full_name: string; family_id: string } | null
  }[]
  childrenWithoutCurrentCycle: { id: string; full_name: string; family_id: string }[]
}

export async function getRecepcionDashboardData(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<RecepcionDashboardData> {
  const { startISO, endISO, periodLabel } = monthBoundsSV(now)
  const periodMonth = startISO.slice(0, 8) + '01'

  const { data: cyclesRaw } = await supabase
    .from('monthly_session_cycles')
    .select('id, period_month, paid_at, payment_amount_usd, payment_method, status, child_id')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)
    .order('paid_at', { ascending: false })

  const cycles = cyclesRaw ?? []
  const generated = cycles.filter((c) => c.status === 'generated')
  const cancelled = cycles.filter((c) => c.status === 'cancelled')
  const monthlyRevenueUsd = generated.reduce((s, c) => s + Number(c.payment_amount_usd ?? 0), 0)

  // Resolver children de los cycles más recientes
  const recent = cycles.slice(0, 10)
  const recentChildIds = Array.from(new Set(recent.map((c) => c.child_id)))
  const { data: childrenRaw } = recentChildIds.length
    ? await supabase
        .from('children')
        .select('id, full_name, family_id')
        .in('id', recentChildIds)
    : { data: [] as { id: string; full_name: string; family_id: string }[] }
  const childMap = new Map((childrenRaw ?? []).map((c) => [c.id, c]))

  const recentCycles = recent.map((c) => ({
    id: c.id,
    period_month: c.period_month,
    paid_at: c.paid_at,
    payment_amount_usd: Number(c.payment_amount_usd ?? 0),
    payment_method: c.payment_method,
    child: childMap.get(c.child_id) ?? null,
  }))

  // Children activos con plan que NO tienen cycle del mes en curso (a contactar para cobrar)
  const { data: activeWithPlanRaw } = await supabase
    .from('children')
    .select('id, full_name, family_id')
    .eq('treatment_status', 'active')
  const activeChildren = (activeWithPlanRaw ?? []) as {
    id: string
    full_name: string
    family_id: string
  }[]
  const activeChildIds = activeChildren.map((c) => c.id)

  let childrenWithoutCurrentCycle: typeof activeChildren = []
  if (activeChildIds.length > 0) {
    // Quiénes ya tienen cycle activo del mes
    const { data: existingRaw } = await supabase
      .from('monthly_session_cycles')
      .select('child_id')
      .in('child_id', activeChildIds)
      .eq('period_month', periodMonth)
      .neq('status', 'cancelled')
    const withCycle = new Set((existingRaw ?? []).map((r) => r.child_id))

    // Y quiénes tienen plan activo (sin plan no se le puede cobrar)
    const { data: plansRaw } = await supabase
      .from('treatment_plans')
      .select('child_id')
      .in('child_id', activeChildIds)
      .eq('active', true)
    const withPlan = new Set((plansRaw ?? []).map((r) => r.child_id))

    childrenWithoutCurrentCycle = activeChildren
      .filter((c) => withPlan.has(c.id) && !withCycle.has(c.id))
      .slice(0, 15)
  }

  return {
    periodLabel,
    monthlyRevenueUsd,
    cyclesPaidThisMonth: generated.length,
    cyclesCancelledThisMonth: cancelled.length,
    recentCycles,
    childrenWithoutCurrentCycle,
  }
}
