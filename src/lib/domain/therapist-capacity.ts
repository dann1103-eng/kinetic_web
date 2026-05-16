/**
 * Cálculo de ocupación semanal de terapistas.
 *
 * Compara horas agendadas (citas activas) vs horas laborales contractuales
 * (de `therapist_work_schedule`) en una semana específica.
 */

import type { TherapistWorkScheduleBlock } from '@/types/db'

export interface TherapistLite {
  id: string
  full_name: string
  max_hours_per_week: number | null
}

export interface AppointmentLite {
  therapist_id: string | null
  starts_at: string
  ends_at: string
  status: string
}

export interface DayOccupancy {
  /** 0=lunes, 6=domingo (índice del array de salida). */
  dayIndex: number
  workedMinutes: number
  scheduledMinutes: number
}

export interface WeeklyOccupancy {
  therapistId: string
  therapistName: string
  byDay: DayOccupancy[]  // siempre length=7, índice 0=lunes
  totalWorkedMinutes: number
  totalScheduledMinutes: number
  occupancyPct: number       // 0-100, redondeado
  maxHoursPerWeek: number | null
  /** True si totalWorked supera maxHoursPerWeek. */
  overContract: boolean
}

/** Lunes 00:00 local de la semana que contiene `d`. */
export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay() // 0=dom, 1=lun, ..., 6=sáb
  const diff = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() + diff)
  return r
}

/** Domingo 23:59:59 local de la semana que contiene `d`. */
export function endOfWeekSunday(d: Date): Date {
  const r = startOfWeekMonday(d)
  r.setDate(r.getDate() + 6)
  r.setHours(23, 59, 59, 999)
  return r
}

/** day_of_week (0=dom..6=sáb) → índice del array (0=lun..6=dom). */
function dowToIndex(dow: number): number {
  return dow === 0 ? 6 : dow - 1
}

/** Parsea "HH:MM:SS" o "HH:MM" → minutos desde 00:00. */
function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Estados de cita que NO cuentan como ocupación. */
const EXCLUDED_STATUSES = new Set(['rescheduled', 'no_show', 'late_cancel', 'cancelled'])

/**
 * Calcula la ocupación de cada terapista en la semana [weekStart, weekStart+7d].
 *
 * - `byDay[i].workedMinutes`: suma de duraciones de citas activas en el día i (0=lun)
 * - `byDay[i].scheduledMinutes`: minutos del bloque laboral configurado para ese día
 * - `occupancyPct`: totalWorked / totalScheduled (si scheduled > 0)
 * - `overContract`: true si totalWorked > maxHoursPerWeek * 60
 */
export function calculateWeeklyOccupancy(
  therapists: TherapistLite[],
  schedules: TherapistWorkScheduleBlock[],
  appointments: AppointmentLite[],
  weekStart: Date,
): WeeklyOccupancy[] {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // Agrupar bloques laborales por terapista
  const schedulesByTherapist = new Map<string, TherapistWorkScheduleBlock[]>()
  for (const s of schedules) {
    if (!s.active) continue
    const arr = schedulesByTherapist.get(s.therapist_id) ?? []
    arr.push(s)
    schedulesByTherapist.set(s.therapist_id, arr)
  }

  // Agrupar citas por terapista (filtradas a la ventana + estados válidos)
  const apptsByTherapist = new Map<string, AppointmentLite[]>()
  for (const a of appointments) {
    if (!a.therapist_id) continue
    if (EXCLUDED_STATUSES.has(a.status)) continue
    const start = new Date(a.starts_at)
    if (start < weekStart || start >= weekEnd) continue
    const arr = apptsByTherapist.get(a.therapist_id) ?? []
    arr.push(a)
    apptsByTherapist.set(a.therapist_id, arr)
  }

  return therapists.map((t) => {
    const byDay: DayOccupancy[] = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      workedMinutes: 0,
      scheduledMinutes: 0,
    }))

    // Bloques laborales
    const blocks = schedulesByTherapist.get(t.id) ?? []
    for (const b of blocks) {
      const idx = dowToIndex(b.day_of_week)
      const mins = timeStringToMinutes(b.end_time) - timeStringToMinutes(b.start_time)
      byDay[idx].scheduledMinutes += mins
    }

    // Citas
    const appts = apptsByTherapist.get(t.id) ?? []
    for (const a of appts) {
      const start = new Date(a.starts_at)
      const end = new Date(a.ends_at)
      // Índice 0=lunes
      const day = start.getDay()
      const idx = dowToIndex(day)
      const mins = Math.max(0, (end.getTime() - start.getTime()) / 60_000)
      byDay[idx].workedMinutes += mins
    }

    const totalWorked = byDay.reduce((s, d) => s + d.workedMinutes, 0)
    const totalScheduled = byDay.reduce((s, d) => s + d.scheduledMinutes, 0)
    const pct =
      totalScheduled > 0
        ? Math.round((totalWorked / totalScheduled) * 100)
        : 0
    const overContract =
      t.max_hours_per_week != null && totalWorked > t.max_hours_per_week * 60

    return {
      therapistId: t.id,
      therapistName: t.full_name,
      byDay,
      totalWorkedMinutes: totalWorked,
      totalScheduledMinutes: totalScheduled,
      occupancyPct: pct,
      maxHoursPerWeek: t.max_hours_per_week,
      overContract,
    }
  })
}

/** Color por % ocupación: verde <60, amarillo 60-85, rojo >85. */
export function occupancyToneClasses(pct: number, scheduled: number): {
  bg: string
  text: string
} {
  if (scheduled === 0) {
    return { bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' }
  }
  if (pct < 60) return { bg: 'bg-emerald-100', text: 'text-emerald-900' }
  if (pct <= 85) return { bg: 'bg-amber-100', text: 'text-amber-900' }
  return { bg: 'bg-rose-100', text: 'text-rose-900' }
}

/** "5.5h / 8h" formato compacto. */
export function formatHoursFraction(workedMin: number, scheduledMin: number): string {
  const w = (workedMin / 60).toFixed(1).replace(/\.0$/, '')
  if (scheduledMin === 0) return `${w}h`
  const s = (scheduledMin / 60).toFixed(1).replace(/\.0$/, '')
  return `${w}h / ${s}h`
}
