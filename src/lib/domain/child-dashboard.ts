/**
 * Datos del "dashboard" mensual de un niño (Ronda 3a).
 *
 * Devuelve KPIs del mes en curso + lista de sesiones del mes (para grilla
 * calendario) + próximas 14 días reales + última sesión completada.
 *
 * Reusa `is_agency_user()` RLS — el caller debe estar logueado como staff.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment, AppointmentAbsence, Database, ServiceType } from '@/types/db'

const TZ = 'America/El_Salvador'

export interface ChildDashboardKpis {
  scheduled: number       // status='scheduled' o 'in_progress' del mes
  completed: number
  noShowPendingReplace: number
  noShowWaived: number
  replacement: number     // appointments status='replacement' del mes (reposiciones de meses anteriores que cayeron acá)
  late_cancel: number
  total: number           // todas las del mes (todos los status)
}

export type AttendanceCellStatus =
  | 'completed'           // verde
  | 'in_progress'         // azul
  | 'scheduled_future'    // gris claro (futura programada)
  | 'scheduled_today'     // azul claro (hoy)
  | 'replacement_future'  // verde claro (reposición futura)
  | 'replacement_done'    // verde con borde (reposición ya completada)
  | 'no_show_pending'     // rojo
  | 'no_show_waived'      // amarillo
  | 'late_cancel'         // naranja
  | 'rescheduled'         // gris tachado (movida — no se cuenta)
  | 'empty'               // sin sesión ese día

export interface AttendanceCell {
  date: string            // 'YYYY-MM-DD' en SV
  appointments: Array<{
    id: string
    starts_at: string
    ends_at: string
    service_type: ServiceType | string | null
    status: Appointment['status']
    cellStatus: AttendanceCellStatus
    is_replacement: boolean
    has_pending_absence: boolean
    has_waived_absence: boolean
  }>
}

export interface UpcomingAppointment {
  id: string
  starts_at: string
  ends_at: string
  service_type: ServiceType | string | null
  status: Appointment['status']
  is_replacement: boolean
}

export interface ChildDashboardData {
  /** Mes en curso del que se calculó: 'YYYY-MM-01' (date) en TZ SV. */
  period_month: string
  kpis: ChildDashboardKpis
  /** Una entrada por día del mes; appointments[] vacío si no hay sesión ese día. */
  attendance: AttendanceCell[]
  /** Próximas 14 días desde hoy: scheduled o replacement. */
  upcoming: UpcomingAppointment[]
  /** Última sesión completada (puede ser de cualquier mes). */
  last_completed: UpcomingAppointment | null
}

/** Inicio del mes en TZ SV (date 'YYYY-MM-01' como string). */
function monthStartInSV(now: Date = new Date()): string {
  const local = toZonedTime(now, TZ)
  const y = local.getFullYear()
  const m = local.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** Cantidad de días en el mes. */
function daysInMonth(periodMonth: string): number {
  const [y, m] = periodMonth.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** ISO inicio/fin del mes en TZ SV. */
function monthBoundsISO(periodMonth: string): { startISO: string; endISO: string } {
  const [y, m] = periodMonth.split('-').map(Number)
  const start = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ)  // primer día del siguiente mes
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

/** Devuelve 'YYYY-MM-DD' del appointment en TZ SV. */
function dateKeyInSV(iso: string): string {
  const local = toZonedTime(new Date(iso), TZ)
  const y = local.getFullYear()
  const m = String(local.getMonth() + 1).padStart(2, '0')
  const d = String(local.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayInSVKey(now: Date = new Date()): string {
  return dateKeyInSV(now.toISOString())
}

function classifyCell(
  appt: Appointment,
  hasPendingAbsence: boolean,
  hasWaivedAbsence: boolean,
  todayKey: string,
): AttendanceCellStatus {
  const dateKey = dateKeyInSV(appt.starts_at)
  const isReplacement = appt.status === 'replacement'

  switch (appt.status) {
    case 'completed':
      return isReplacement ? 'replacement_done' : 'completed'
    case 'in_progress':
      return 'in_progress'
    case 'scheduled':
      if (dateKey === todayKey) return 'scheduled_today'
      return 'scheduled_future'
    case 'replacement':
      // Replacement no es un status que continúa; debería ser scheduled o completed.
      // Si llega acá literal, lo tratamos como scheduled futura.
      return 'replacement_future'
    case 'no_show':
      if (hasWaivedAbsence) return 'no_show_waived'
      if (hasPendingAbsence) return 'no_show_pending'
      return 'no_show_pending'
    case 'late_cancel':
      return 'late_cancel'
    case 'rescheduled':
      return 'rescheduled'
    default:
      return 'empty'
  }
}

export async function getChildDashboardData(
  supabase: SupabaseClient<Database>,
  childId: string,
  now: Date = new Date(),
  /** Mes a mostrar en la grilla ('YYYY-MM'). Default = mes de `now`. Permite
   *  navegar a meses futuros/pasados (ej. ver el ciclo del próximo mes ya
   *  agendado). "Hoy" y "próximas 14 días" siguen siendo relativas a `now`. */
  viewMonth?: string,
): Promise<ChildDashboardData> {
  const periodMonth =
    viewMonth && /^\d{4}-\d{2}$/.test(viewMonth) ? `${viewMonth}-01` : monthStartInSV(now)
  const { startISO, endISO } = monthBoundsISO(periodMonth)
  const todayKey = todayInSVKey(now)

  // Citas del mes
  const { data: monthApptsRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('child_id', childId)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at')

  const monthAppts = (monthApptsRaw ?? []) as Appointment[]

  // Absences asociadas a esos appointments
  const apptIds = monthAppts.map((a) => a.id)
  const absencesById = new Map<string, AppointmentAbsence>()
  if (apptIds.length > 0) {
    const { data: absRaw } = await supabase
      .from('appointment_absences')
      .select('*')
      .in('appointment_id', apptIds)
    for (const a of (absRaw ?? []) as AppointmentAbsence[]) {
      absencesById.set(a.appointment_id, a)
    }
  }

  // KPIs
  const kpis: ChildDashboardKpis = {
    scheduled: 0,
    completed: 0,
    noShowPendingReplace: 0,
    noShowWaived: 0,
    replacement: 0,
    late_cancel: 0,
    total: monthAppts.length,
  }

  for (const a of monthAppts) {
    const abs = absencesById.get(a.id)
    if (a.status === 'scheduled' || a.status === 'in_progress') kpis.scheduled++
    else if (a.status === 'completed') kpis.completed++
    else if (a.status === 'no_show') {
      if (abs?.status === 'waived') kpis.noShowWaived++
      else kpis.noShowPendingReplace++
    } else if (a.status === 'late_cancel') kpis.late_cancel++

    if (a.parent_appointment_id) kpis.replacement++
  }

  // Grilla calendario
  const cellsByDate = new Map<string, AttendanceCell['appointments']>()
  for (const a of monthAppts) {
    const dateKey = dateKeyInSV(a.starts_at)
    if (!cellsByDate.has(dateKey)) cellsByDate.set(dateKey, [])
    const abs = absencesById.get(a.id)
    cellsByDate.get(dateKey)!.push({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      service_type: a.service_type ?? null,
      status: a.status,
      cellStatus: classifyCell(a, abs?.status === 'pending', abs?.status === 'waived', todayKey),
      is_replacement: !!a.parent_appointment_id,
      has_pending_absence: abs?.status === 'pending',
      has_waived_absence: abs?.status === 'waived',
    })
  }

  const totalDays = daysInMonth(periodMonth)
  const attendance: AttendanceCell[] = []
  for (let d = 1; d <= totalDays; d++) {
    const dateKey = `${periodMonth.slice(0, 8)}${String(d).padStart(2, '0')}`
    attendance.push({
      date: dateKey,
      appointments: cellsByDate.get(dateKey) ?? [],
    })
  }

  // Próximas 14 días reales (scheduled, in_progress, replacement)
  const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const { data: upcomingRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('child_id', childId)
    .gte('starts_at', now.toISOString())
    .lt('starts_at', fourteenDaysLater.toISOString())
    .in('status', ['scheduled', 'in_progress', 'replacement'])
    .order('starts_at')
    .limit(20)

  const upcoming = ((upcomingRaw ?? []) as Appointment[]).map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    service_type: a.service_type ?? null,
    status: a.status,
    is_replacement: !!a.parent_appointment_id,
  }))

  // Última sesión completada (cualquier mes)
  const { data: lastRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('child_id', childId)
    .eq('status', 'completed')
    .order('starts_at', { ascending: false })
    .limit(1)

  const lastCompletedAppt = (lastRaw ?? [])[0] as Appointment | undefined
  const last_completed: UpcomingAppointment | null = lastCompletedAppt
    ? {
        id: lastCompletedAppt.id,
        starts_at: lastCompletedAppt.starts_at,
        ends_at: lastCompletedAppt.ends_at,
        service_type: lastCompletedAppt.service_type ?? null,
        status: lastCompletedAppt.status,
        is_replacement: !!lastCompletedAppt.parent_appointment_id,
      }
    : null

  return {
    period_month: periodMonth,
    kpis,
    attendance,
    upcoming,
    last_completed,
  }
}
