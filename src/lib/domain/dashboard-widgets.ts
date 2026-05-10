/**
 * Datos agregados para los widgets nuevos del dashboard (admin/directora).
 * Cada función es independiente y consume el supabase del request (RLS).
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const TZ = 'America/El_Salvador'

// ── Helpers de fecha ──────────────────────────────────────────────────────

function monthStartSV(now: Date): Date {
  const local = toZonedTime(now, TZ)
  return fromZonedTime(
    new Date(local.getFullYear(), local.getMonth(), 1, 0, 0, 0),
    TZ,
  )
}

function nextMonthStartSV(now: Date): Date {
  const local = toZonedTime(now, TZ)
  return fromZonedTime(
    new Date(local.getFullYear(), local.getMonth() + 1, 1, 0, 0, 0),
    TZ,
  )
}

function daysInMonthSV(now: Date): number {
  const local = toZonedTime(now, TZ)
  return new Date(local.getFullYear(), local.getMonth() + 1, 0).getDate()
}

function dayOfMonthSV(iso: string): number {
  return toZonedTime(new Date(iso), TZ).getDate()
}

// ── Revenue por día del mes ───────────────────────────────────────────────

export interface RevenueDay {
  day: number
  amountUsd: number
}

export async function getRevenueByDayCurrentMonth(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<RevenueDay[]> {
  const startISO = monthStartSV(now).toISOString()
  const endISO = nextMonthStartSV(now).toISOString()
  const totalDays = daysInMonthSV(now)

  const { data } = await supabase
    .from('monthly_session_cycles')
    .select('paid_at, payment_amount_usd')
    .eq('status', 'generated')
    .gte('paid_at', startISO)
    .lt('paid_at', endISO)

  const byDay = new Map<number, number>()
  for (const row of data ?? []) {
    if (!row.paid_at) continue
    const day = dayOfMonthSV(row.paid_at)
    byDay.set(
      day,
      (byDay.get(day) ?? 0) + Number(row.payment_amount_usd ?? 0),
    )
  }

  const series: RevenueDay[] = []
  for (let d = 1; d <= totalDays; d++) {
    series.push({ day: d, amountUsd: byDay.get(d) ?? 0 })
  }
  return series
}

// ── Top terapistas del mes ────────────────────────────────────────────────

export interface TopTherapistRow {
  therapistId: string
  fullName: string
  sessionsCompleted: number
  reportsApproved: number
}

export async function getTopTherapistsThisMonth(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
  limit = 5,
): Promise<TopTherapistRow[]> {
  const startISO = monthStartSV(now).toISOString()
  const endISO = nextMonthStartSV(now).toISOString()

  // Sesiones completadas del mes
  const { data: sessionsRaw } = await supabase
    .from('therapy_sessions')
    .select('therapist_id, ended_at')
    .gte('started_at', startISO)
    .lt('started_at', endISO)
    .not('ended_at', 'is', null)
    .not('therapist_id', 'is', null)

  const sessionsByTher = new Map<string, number>()
  for (const s of sessionsRaw ?? []) {
    if (!s.therapist_id) continue
    sessionsByTher.set(
      s.therapist_id,
      (sessionsByTher.get(s.therapist_id) ?? 0) + 1,
    )
  }

  // Reportes aprobados del mes (el autor es el terapista que llenó el reporte)
  const { data: reportsRaw } = await supabase
    .from('session_reports')
    .select('therapist_id, status, approved_at')
    .in('status', ['approved', 'sent_to_family'])
    .gte('approved_at', startISO)
    .lt('approved_at', endISO)
    .not('therapist_id', 'is', null)

  const reportsByAuthor = new Map<string, number>()
  for (const r of reportsRaw ?? []) {
    if (!r.therapist_id) continue
    reportsByAuthor.set(
      r.therapist_id,
      (reportsByAuthor.get(r.therapist_id) ?? 0) + 1,
    )
  }

  const therapistIds = new Set<string>([
    ...sessionsByTher.keys(),
    ...reportsByAuthor.keys(),
  ])
  if (therapistIds.size === 0) return []

  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', Array.from(therapistIds))

  const nameById = new Map(
    (usersRaw ?? []).map((u) => [u.id, u.full_name ?? 'Sin nombre']),
  )

  const rows: TopTherapistRow[] = []
  for (const id of therapistIds) {
    rows.push({
      therapistId: id,
      fullName: nameById.get(id) ?? 'Sin nombre',
      sessionsCompleted: sessionsByTher.get(id) ?? 0,
      reportsApproved: reportsByAuthor.get(id) ?? 0,
    })
  }
  return rows
    .sort(
      (a, b) =>
        b.sessionsCompleted - a.sessionsCompleted ||
        b.reportsApproved - a.reportsApproved,
    )
    .slice(0, limit)
}

// ── Calendario heatmap del mes ────────────────────────────────────────────

export interface HeatmapDay {
  day: number
  count: number
}

export async function getAppointmentsHeatmapMonth(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<HeatmapDay[]> {
  const startISO = monthStartSV(now).toISOString()
  const endISO = nextMonthStartSV(now).toISOString()
  const totalDays = daysInMonthSV(now)

  const { data } = await supabase
    .from('appointments')
    .select('starts_at, status')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .not('status', 'eq', 'rescheduled')

  const byDay = new Map<number, number>()
  for (const row of data ?? []) {
    if (!row.starts_at) continue
    const day = dayOfMonthSV(row.starts_at)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }

  const series: HeatmapDay[] = []
  for (let d = 1; d <= totalDays; d++) {
    series.push({ day: d, count: byDay.get(d) ?? 0 })
  }
  return series
}

// ── Niños en riesgo (alertas) ─────────────────────────────────────────────

export type AtRiskAlert =
  | 'no_emergency_contact'
  | 'no_treatment_plan'
  | 'no_current_cycle'
  | 'pending_absences'

export interface AtRiskChild {
  childId: string
  fullName: string
  familyId: string
  alerts: AtRiskAlert[]
}

export const AT_RISK_ALERT_LABELS: Record<AtRiskAlert, string> = {
  no_emergency_contact: 'Sin contacto de emergencia',
  no_treatment_plan: 'Sin plan de tratamiento',
  no_current_cycle: 'Sin ciclo del mes',
  pending_absences: 'Inasistencias por reagendar',
}

export async function getChildrenAtRisk(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
  limit = 10,
): Promise<AtRiskChild[]> {
  const startISO = monthStartSV(now).toISOString()
  const periodMonth = startISO.slice(0, 8) + '01'

  const { data: children } = await supabase
    .from('children')
    .select('id, full_name, family_id')
    .eq('treatment_status', 'active')

  const list = (children ?? []) as {
    id: string
    full_name: string
    family_id: string
  }[]
  if (list.length === 0) return []

  const childIds = list.map((c) => c.id)
  const familyIds = Array.from(new Set(list.map((c) => c.family_id)))

  const [
    { data: families },
    { data: plans },
    { data: cycles },
    { data: absences },
  ] = await Promise.all([
    supabase
      .from('families')
      .select('id, emergency_contact_name')
      .in('id', familyIds),
    supabase
      .from('treatment_plans')
      .select('child_id, active')
      .in('child_id', childIds)
      .eq('active', true),
    supabase
      .from('monthly_session_cycles')
      .select('child_id')
      .in('child_id', childIds)
      .eq('period_month', periodMonth)
      .neq('status', 'cancelled'),
    supabase
      .from('appointment_absences')
      .select('child_id')
      .in('child_id', childIds)
      .eq('status', 'pending'),
  ])

  const familyHasEmergency = new Map(
    (families ?? []).map((f) => [
      f.id,
      !!(f as { emergency_contact_name?: string | null }).emergency_contact_name,
    ]),
  )
  const childHasPlan = new Set((plans ?? []).map((p) => p.child_id))
  const childHasCycle = new Set((cycles ?? []).map((c) => c.child_id))
  const absenceCountByChild = new Map<string, number>()
  for (const a of absences ?? []) {
    absenceCountByChild.set(
      a.child_id,
      (absenceCountByChild.get(a.child_id) ?? 0) + 1,
    )
  }

  const result: AtRiskChild[] = []
  for (const child of list) {
    const alerts: AtRiskAlert[] = []
    if (!familyHasEmergency.get(child.family_id)) {
      alerts.push('no_emergency_contact')
    }
    if (!childHasPlan.has(child.id)) alerts.push('no_treatment_plan')
    if (!childHasCycle.has(child.id)) alerts.push('no_current_cycle')
    if ((absenceCountByChild.get(child.id) ?? 0) >= 2) {
      alerts.push('pending_absences')
    }
    if (alerts.length > 0) {
      result.push({
        childId: child.id,
        fullName: child.full_name,
        familyId: child.family_id,
        alerts,
      })
    }
  }

  return result
    .sort((a, b) => b.alerts.length - a.alerts.length)
    .slice(0, limit)
}

// ── Reportes por niño (overview) ──────────────────────────────────────────

export interface ChildReportOverview {
  childId: string
  fullName: string
  familyId: string
  intakePhase: string
  treatmentStatus: string
  /** Estado del último informe trimestral. */
  lastProgressReportStatus: string | null
  /** Cuántos session_reports pendientes (draft/submitted/rejected). */
  sessionReportsPending: number
  /** Tasa de asistencia del mes (0-1) o null si no hay citas. */
  attendanceRate: number | null
  /** Citas del mes (usadas para el cálculo). */
  monthlyAppointmentsCount: number
}

export async function getChildrenReportsOverview(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
  limit = 12,
): Promise<ChildReportOverview[]> {
  const startISO = monthStartSV(now).toISOString()
  const endISO = nextMonthStartSV(now).toISOString()

  const { data: children } = await supabase
    .from('children')
    .select('id, full_name, family_id, intake_phase, treatment_status')
    .eq('treatment_status', 'active')
    .order('full_name')
    .limit(limit)

  const list = (children ?? []) as {
    id: string
    full_name: string
    family_id: string
    intake_phase: string
    treatment_status: string
  }[]
  if (list.length === 0) return []

  const childIds = list.map((c) => c.id)

  const [{ data: progress }, { data: sessionReports }, { data: appointments }] =
    await Promise.all([
      supabase
        .from('progress_reports')
        .select('child_id, status, period_ends')
        .in('child_id', childIds)
        .order('period_ends', { ascending: false }),
      supabase
        .from('session_reports')
        .select('child_id, status')
        .in('child_id', childIds)
        .in('status', ['draft', 'submitted', 'rejected']),
      supabase
        .from('appointments')
        .select('child_id, status')
        .in('child_id', childIds)
        .gte('starts_at', startISO)
        .lt('starts_at', endISO),
    ])

  const lastProgressByChild = new Map<string, string>()
  for (const r of progress ?? []) {
    if (!lastProgressByChild.has(r.child_id)) {
      lastProgressByChild.set(r.child_id, r.status)
    }
  }

  const pendingByChild = new Map<string, number>()
  for (const r of sessionReports ?? []) {
    pendingByChild.set(
      r.child_id,
      (pendingByChild.get(r.child_id) ?? 0) + 1,
    )
  }

  const totalsByChild = new Map<string, { total: number; attended: number }>()
  for (const a of appointments ?? []) {
    const t = totalsByChild.get(a.child_id) ?? { total: 0, attended: 0 }
    t.total += 1
    if (a.status === 'completed') t.attended += 1
    totalsByChild.set(a.child_id, t)
  }

  return list.map((c) => {
    const t = totalsByChild.get(c.id)
    const attendanceRate =
      t && t.total > 0 ? t.attended / t.total : null
    return {
      childId: c.id,
      fullName: c.full_name,
      familyId: c.family_id,
      intakePhase: c.intake_phase,
      treatmentStatus: c.treatment_status,
      lastProgressReportStatus: lastProgressByChild.get(c.id) ?? null,
      sessionReportsPending: pendingByChild.get(c.id) ?? 0,
      attendanceRate,
      monthlyAppointmentsCount: t?.total ?? 0,
    }
  })
}

// ── Bundle: todos los datos extras del MgmtDashboard ──────────────────────

export interface MgmtWidgetsData {
  revenueByDay: RevenueDay[]
  appointmentsHeatmap: HeatmapDay[]
  topTherapists: TopTherapistRow[]
  childrenAtRisk: AtRiskChild[]
  childrenReports: ChildReportOverview[]
}

export async function getMgmtWidgetsData(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<MgmtWidgetsData> {
  const [
    revenueByDay,
    appointmentsHeatmap,
    topTherapists,
    childrenAtRisk,
    childrenReports,
  ] = await Promise.all([
    getRevenueByDayCurrentMonth(supabase, now),
    getAppointmentsHeatmapMonth(supabase, now),
    getTopTherapistsThisMonth(supabase, now, 5),
    getChildrenAtRisk(supabase, now, 10),
    getChildrenReportsOverview(supabase, now, 12),
  ])
  return {
    revenueByDay,
    appointmentsHeatmap,
    topTherapists,
    childrenAtRisk,
    childrenReports,
  }
}
