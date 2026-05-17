/**
 * Reportes por terapista — KPIs mensuales.
 *
 * 3 indicadores por terapista en un período (típicamente un mes):
 *   - Asistencia (sesiones completadas, no-shows, late-cancels, reposiciones cumplidas)
 *   - Carga horaria (horas reales vs horas contratadas)
 *   - Cumplimiento de informes cuatrimestrales (como terapista principal de niños)
 *
 * Las funciones leen `appointments`, `appointment_absences`, `users`,
 * `treatment_plans`, `progress_reports`. Sin migración nueva.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserRole } from '@/types/db'

const TZ = 'America/El_Salvador'

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const THERAPIST_ROLES: UserRole[] = ['terapista', 'maestra']

/** Bounds ISO [start, end) que cubre un mes entero en zona SV. */
export function monthBoundsSV(year: number, month: number): {
  startISO: string
  endISO: string
  daysInMonth: number
} {
  const start = fromZonedTime(new Date(year, month - 1, 1, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(year, month, 1, 0, 0, 0), TZ)
  const daysInMonth = new Date(year, month, 0).getDate()
  return { startISO: start.toISOString(), endISO: end.toISOString(), daysInMonth }
}

export interface TherapistInfo {
  id: string
  full_name: string
  role: UserRole
  max_hours_per_week: number | null
}

// ──────────────────────────────────────────────────────────────────────────
// Asistencia
// ──────────────────────────────────────────────────────────────────────────

export interface AttendanceKpi {
  completed: number
  no_show: number
  late_cancel: number
  replacement_attended: number
  /** Total de citas con resultado definitivo (excluye scheduled / rescheduled). */
  resolvedTotal: number
  /** % de completed sobre el total resuelto. */
  showRatePct: number
}

interface AppointmentRow {
  id: string
  therapist_id: string | null
  status: string
  starts_at: string
  ends_at: string
}

interface AbsenceRow {
  status: string
  replacement_appointment_id: string | null
  resolved_at: string | null
}

function emptyAttendance(): AttendanceKpi {
  return {
    completed: 0,
    no_show: 0,
    late_cancel: 0,
    replacement_attended: 0,
    resolvedTotal: 0,
    showRatePct: 0,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Carga horaria
// ──────────────────────────────────────────────────────────────────────────

export interface HoursLoadKpi {
  hoursWorked: number
  hoursContracted: number | null
  occupancyPct: number | null
  maxHoursPerWeek: number | null
}

function emptyHoursLoad(maxHoursPerWeek: number | null): HoursLoadKpi {
  return {
    hoursWorked: 0,
    hoursContracted: maxHoursPerWeek != null ? maxHoursPerWeek * (30 / 7) : null,
    occupancyPct: null,
    maxHoursPerWeek,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Cumplimiento de informes
// ──────────────────────────────────────────────────────────────────────────

export interface ReportsComplianceKpi {
  /** Niños activos donde este terapista es primary. */
  childrenAsPrimary: number
  /** Informes que vencen en este período (period_ends dentro de [from, to]). */
  reportsDue: number
  /** De los due, cuántos llegaron a estado approved/sent_to_family. */
  reportsDelivered: number
  /** Pendientes (draft/submitted/rejected) o no creados. */
  reportsPending: number
  compliancePct: number
}

function emptyReportsCompliance(): ReportsComplianceKpi {
  return {
    childrenAsPrimary: 0,
    reportsDue: 0,
    reportsDelivered: 0,
    reportsPending: 0,
    compliancePct: 0,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Función combinada — devuelve una fila por terapista con los 3 KPIs
// ──────────────────────────────────────────────────────────────────────────

export interface TherapistMonthlyKpiRow {
  therapist: TherapistInfo
  attendance: AttendanceKpi
  hoursLoad: HoursLoadKpi
  reports: ReportsComplianceKpi
}

export interface TherapistMonthlyReport {
  year: number
  month: number
  monthLabel: string             // "Mayo 2026"
  rows: TherapistMonthlyKpiRow[]
  totals: {
    therapists: number
    completed: number
    no_show: number
    late_cancel: number
    replacement_attended: number
    hoursWorked: number
    childrenAsPrimary: number
    reportsDue: number
    reportsDelivered: number
  }
}

export async function getTherapistMonthlyReport(
  supabase: SupabaseClient<Database>,
  opts: { year: number; month: number },
): Promise<TherapistMonthlyReport> {
  const { startISO, endISO, daysInMonth } = monthBoundsSV(opts.year, opts.month)

  // 1. Terapistas relevantes
  const { data: therapistsRaw } = await supabase
    .from('users')
    .select('id, full_name, role, max_hours_per_week')
    .in('role', THERAPIST_ROLES)
    .order('full_name')
  const therapists = ((therapistsRaw ?? []) as TherapistInfo[])
  const therapistIds = therapists.map((t) => t.id)
  const byId = new Map(therapists.map((t) => [t.id, t]))

  // 2. Appointments del mes — todos para los terapistas relevantes
  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('id, therapist_id, status, starts_at, ends_at')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .in('therapist_id', therapistIds.length > 0 ? therapistIds : [''])
  const appts = (apptsRaw ?? []) as AppointmentRow[]

  // 3. Absences resueltas como reposición en el mes (para contar replacement_attended)
  const { data: absencesRaw } = await supabase
    .from('appointment_absences')
    .select('status, replacement_appointment_id, resolved_at, therapist_id')
    .eq('status', 'replaced')
    .gte('resolved_at', startISO)
    .lt('resolved_at', endISO)
  const absences = (absencesRaw ?? []) as Array<AbsenceRow & { therapist_id: string | null }>

  // 4. Treatment plans activos para encontrar children por primary_therapist
  const { data: plansRaw } = await supabase
    .from('treatment_plans')
    .select('child_id, primary_therapist_id, active')
    .eq('active', true)
  const plans = (plansRaw ?? []) as Array<{ child_id: string; primary_therapist_id: string | null; active: boolean }>

  // 5. Progress reports que vencen este mes
  const { data: reportsRaw } = await supabase
    .from('progress_reports')
    .select('child_id, status, period_ends')
    .gte('period_ends', startISO.slice(0, 10))
    .lt('period_ends', endISO.slice(0, 10))
  const reports = (reportsRaw ?? []) as Array<{ child_id: string; status: string; period_ends: string }>

  // ── Build per-therapist rows
  const rows: TherapistMonthlyKpiRow[] = therapists.map((t) => {
    const myAppts = appts.filter((a) => a.therapist_id === t.id)
    const attendance = computeAttendance(myAppts)
    const replacementAttended = absences.filter((a) => a.therapist_id === t.id).length
    attendance.replacement_attended = replacementAttended

    const hoursLoad = computeHoursLoad(myAppts, t.max_hours_per_week, daysInMonth)

    const myChildIds = plans
      .filter((p) => p.primary_therapist_id === t.id)
      .map((p) => p.child_id)
    const myReports = reports.filter((r) => myChildIds.includes(r.child_id))
    const reportsCompliance = computeReportsCompliance(myChildIds.length, myReports)

    return { therapist: t, attendance, hoursLoad, reports: reportsCompliance }
  })

  const totals = rows.reduce(
    (acc, r) => ({
      therapists: acc.therapists + 1,
      completed: acc.completed + r.attendance.completed,
      no_show: acc.no_show + r.attendance.no_show,
      late_cancel: acc.late_cancel + r.attendance.late_cancel,
      replacement_attended: acc.replacement_attended + r.attendance.replacement_attended,
      hoursWorked: acc.hoursWorked + r.hoursLoad.hoursWorked,
      childrenAsPrimary: acc.childrenAsPrimary + r.reports.childrenAsPrimary,
      reportsDue: acc.reportsDue + r.reports.reportsDue,
      reportsDelivered: acc.reportsDelivered + r.reports.reportsDelivered,
    }),
    {
      therapists: 0, completed: 0, no_show: 0, late_cancel: 0,
      replacement_attended: 0, hoursWorked: 0, childrenAsPrimary: 0,
      reportsDue: 0, reportsDelivered: 0,
    },
  )

  return {
    year: opts.year,
    month: opts.month,
    monthLabel: `${MONTH_LABELS[opts.month - 1]} ${opts.year}`,
    rows,
    totals,
  }
}

// ── Helpers puros ─────────────────────────────────────────────────────────

function computeAttendance(appts: AppointmentRow[]): AttendanceKpi {
  const out = emptyAttendance()
  for (const a of appts) {
    if (a.status === 'completed') out.completed++
    else if (a.status === 'no_show') out.no_show++
    else if (a.status === 'late_cancel') out.late_cancel++
  }
  out.resolvedTotal = out.completed + out.no_show + out.late_cancel
  out.showRatePct = out.resolvedTotal > 0
    ? Math.round((out.completed / out.resolvedTotal) * 1000) / 10
    : 0
  return out
}

function computeHoursLoad(
  appts: AppointmentRow[],
  maxHoursPerWeek: number | null,
  daysInMonth: number,
): HoursLoadKpi {
  let workedMs = 0
  for (const a of appts) {
    if (a.status !== 'completed') continue
    const start = new Date(a.starts_at).getTime()
    const end = new Date(a.ends_at).getTime()
    workedMs += Math.max(0, end - start)
  }
  const hoursWorked = Math.round((workedMs / 3_600_000) * 10) / 10
  const hoursContracted = maxHoursPerWeek != null
    ? Math.round(maxHoursPerWeek * (daysInMonth / 7) * 10) / 10
    : null
  const occupancyPct = hoursContracted != null && hoursContracted > 0
    ? Math.round((hoursWorked / hoursContracted) * 1000) / 10
    : null
  return { hoursWorked, hoursContracted, occupancyPct, maxHoursPerWeek }
}

function computeReportsCompliance(
  childrenAsPrimary: number,
  reports: Array<{ child_id: string; status: string }>,
): ReportsComplianceKpi {
  const dueChildIds = new Set(reports.map((r) => r.child_id))
  const delivered = reports.filter(
    (r) => r.status === 'approved' || r.status === 'sent_to_family',
  ).length
  const reportsDue = dueChildIds.size
  const reportsPending = reportsDue - delivered
  const compliancePct = reportsDue > 0
    ? Math.round((delivered / reportsDue) * 1000) / 10
    : 0
  return {
    childrenAsPrimary,
    reportsDue,
    reportsDelivered: delivered,
    reportsPending,
    compliancePct,
  }
}

// ── Detalle individual por terapista (para PDF individual) ────────────────

export interface TherapistDetailRow {
  date: string                   // YYYY-MM-DD
  childName: string | null
  serviceType: string | null
  status: string
  durationMinutes: number
  isReplacement: boolean
}

export interface TherapistDetailedReport {
  therapist: TherapistInfo
  year: number
  month: number
  monthLabel: string
  kpis: { attendance: AttendanceKpi; hoursLoad: HoursLoadKpi; reports: ReportsComplianceKpi }
  appointments: TherapistDetailRow[]
}

export async function getTherapistDetailedReport(
  supabase: SupabaseClient<Database>,
  opts: { year: number; month: number; therapistId: string },
): Promise<TherapistDetailedReport | null> {
  const { startISO, endISO, daysInMonth } = monthBoundsSV(opts.year, opts.month)

  const { data: therapistRow } = await supabase
    .from('users')
    .select('id, full_name, role, max_hours_per_week')
    .eq('id', opts.therapistId)
    .maybeSingle()
  if (!therapistRow) return null
  const therapist = therapistRow as TherapistInfo

  // Appointments del terapista en el mes (con nombres de niños y service_type)
  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('id, status, starts_at, ends_at, service_type, child_id')
    .eq('therapist_id', opts.therapistId)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at')
  const appts = (apptsRaw ?? []) as Array<{
    id: string
    status: string
    starts_at: string
    ends_at: string
    service_type: string | null
    child_id: string | null
  }>

  // Niños para nombres
  const childIds = Array.from(new Set(appts.map((a) => a.child_id).filter((x): x is string => !!x)))
  const childMap = new Map<string, string>()
  if (childIds.length > 0) {
    const { data: childrenRaw } = await supabase
      .from('children')
      .select('id, full_name')
      .in('id', childIds)
    for (const c of (childrenRaw ?? []) as Array<{ id: string; full_name: string }>) {
      childMap.set(c.id, c.full_name)
    }
  }

  // Absences del mes para detectar cuáles citas eran reposición
  const { data: absencesRaw } = await supabase
    .from('appointment_absences')
    .select('replacement_appointment_id, therapist_id, status, resolved_at')
    .eq('therapist_id', opts.therapistId)
    .eq('status', 'replaced')
    .gte('resolved_at', startISO)
    .lt('resolved_at', endISO)
  const replacementIds = new Set(
    (absencesRaw ?? [])
      .map((a) => (a as { replacement_appointment_id: string | null }).replacement_appointment_id)
      .filter((x): x is string => !!x),
  )

  const attendance = computeAttendance(appts.map((a) => ({
    id: a.id,
    therapist_id: opts.therapistId,
    status: a.status,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
  })))
  attendance.replacement_attended = replacementIds.size

  const hoursLoad = computeHoursLoad(
    appts.map((a) => ({
      id: a.id,
      therapist_id: opts.therapistId,
      status: a.status,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
    })),
    therapist.max_hours_per_week,
    daysInMonth,
  )

  // Reports compliance
  const { data: plansRaw } = await supabase
    .from('treatment_plans')
    .select('child_id, primary_therapist_id, active')
    .eq('active', true)
    .eq('primary_therapist_id', opts.therapistId)
  const myChildIds = (plansRaw ?? []).map((p) => p.child_id)
  const { data: reportsRaw } = await supabase
    .from('progress_reports')
    .select('child_id, status, period_ends')
    .in('child_id', myChildIds.length > 0 ? myChildIds : [''])
    .gte('period_ends', startISO.slice(0, 10))
    .lt('period_ends', endISO.slice(0, 10))
  const reports = (reportsRaw ?? []) as Array<{ child_id: string; status: string }>
  const reportsCompliance = computeReportsCompliance(myChildIds.length, reports)

  // Filas de detalle de citas
  const detailRows: TherapistDetailRow[] = appts.map((a) => {
    const start = new Date(a.starts_at)
    const end = new Date(a.ends_at)
    const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const isoLocal = toZonedTime(start, TZ)
    const date = `${isoLocal.getFullYear()}-${String(isoLocal.getMonth() + 1).padStart(2, '0')}-${String(isoLocal.getDate()).padStart(2, '0')}`
    return {
      date,
      childName: a.child_id ? childMap.get(a.child_id) ?? null : null,
      serviceType: a.service_type,
      status: a.status,
      durationMinutes,
      isReplacement: replacementIds.has(a.id),
    }
  })

  return {
    therapist,
    year: opts.year,
    month: opts.month,
    monthLabel: `${MONTH_LABELS[opts.month - 1]} ${opts.year}`,
    kpis: { attendance, hoursLoad, reports: reportsCompliance },
    appointments: detailRows,
  }
}

// ── Helpers de formato ────────────────────────────────────────────────────

export function fmtPercent(v: number, fractionDigits = 1): string {
  return `${v.toFixed(fractionDigits)}%`
}

export function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`
}
