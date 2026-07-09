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
  /** Eventos multi-persona (reuniones, entrevistas, entrega de avances…): todos
   *  los asignados además del principal. La ocupación se cuenta para cada uno. */
  assignee_ids: string[] | null
  /** Para excluir las citas `programa_matutino` por-niño (se cuentan por bloque
   *  de grupo vía GroupSessionLite, no una vez por cada niño). */
  event_type: string
  starts_at: string
  ends_at: string
  status: string
}

/**
 * Bloque de sesión de un grupo matutino. Cuenta como ocupación UNA sola vez por
 * cada terapista/maestra que es staff del grupo (a diferencia de las citas
 * `programa_matutino` por-niño, que se ignoran para no multiplicar la franja).
 */
export interface GroupSessionLite {
  staffUserIds: string[]
  starts_at: string
  ends_at: string
  /** 'scheduled' | 'held' | 'cancelled'. Las canceladas no cuentan. */
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
 * La ocupación de una persona = suma de:
 *  1. Toda cita donde participa (`therapist_id` **o** en `assignee_ids`), de
 *     CUALQUIER tipo de evento (terapia, evaluación, reunión, entrevista, etc.),
 *     contada UNA vez por su duración. Se excluyen las citas `programa_matutino`
 *     por-niño (se cuentan por bloque de grupo, no una por cada niño).
 *  2. Cada sesión de grupo matutino (`groupSessions`) donde es staff, contada
 *     UNA vez por su duración.
 *
 * - `byDay[i].workedMinutes`: minutos ocupados en el día i (0=lun)
 * - `byDay[i].scheduledMinutes`: minutos del bloque laboral configurado para ese día
 * - `occupancyPct`: totalWorked / totalScheduled (si scheduled > 0)
 * - `overContract`: true si totalWorked > maxHoursPerWeek * 60
 */
export function calculateWeeklyOccupancy(
  therapists: TherapistLite[],
  schedules: TherapistWorkScheduleBlock[],
  appointments: AppointmentLite[],
  groupSessions: GroupSessionLite[],
  weekStart: Date,
): WeeklyOccupancy[] {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const therapistIdSet = new Set(therapists.map((t) => t.id))

  // Acumulador byDay por terapista (0=lunes).
  const byDayByTherapist = new Map<string, DayOccupancy[]>()
  for (const t of therapists) {
    byDayByTherapist.set(
      t.id,
      Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, workedMinutes: 0, scheduledMinutes: 0 })),
    )
  }

  // Bloques laborales → scheduledMinutes.
  for (const s of schedules) {
    if (!s.active) continue
    const byDay = byDayByTherapist.get(s.therapist_id)
    if (!byDay) continue
    const idx = dowToIndex(s.day_of_week)
    byDay[idx].scheduledMinutes += timeStringToMinutes(s.end_time) - timeStringToMinutes(s.start_time)
  }

  // Citas → workedMinutes, distribuidas a cada participante (una vez).
  for (const a of appointments) {
    if (EXCLUDED_STATUSES.has(a.status)) continue
    // Las citas por-niño de programa matutino se cuentan por bloque de grupo.
    if (a.event_type === 'programa_matutino') continue
    const start = new Date(a.starts_at)
    if (start < weekStart || start >= weekEnd) continue
    const mins = Math.max(0, (new Date(a.ends_at).getTime() - start.getTime()) / 60_000)
    const idx = dowToIndex(start.getDay())

    // Participantes = union(therapist_id, assignee_ids) ∩ terapistas del equipo.
    const participants = new Set<string>()
    if (a.therapist_id && therapistIdSet.has(a.therapist_id)) participants.add(a.therapist_id)
    for (const uid of a.assignee_ids ?? []) {
      if (therapistIdSet.has(uid)) participants.add(uid)
    }
    for (const uid of participants) {
      byDayByTherapist.get(uid)![idx].workedMinutes += mins
    }
  }

  // Sesiones de grupo matutino → workedMinutes, una vez por cada staff.
  for (const gs of groupSessions) {
    if (gs.status === 'cancelled') continue
    const start = new Date(gs.starts_at)
    if (start < weekStart || start >= weekEnd) continue
    const mins = Math.max(0, (new Date(gs.ends_at).getTime() - start.getTime()) / 60_000)
    const idx = dowToIndex(start.getDay())
    const staff = new Set(gs.staffUserIds.filter((uid) => therapistIdSet.has(uid)))
    for (const uid of staff) {
      byDayByTherapist.get(uid)![idx].workedMinutes += mins
    }
  }

  return therapists.map((t) => {
    const byDay = byDayByTherapist.get(t.id)!
    const totalWorked = byDay.reduce((s, d) => s + d.workedMinutes, 0)
    const totalScheduled = byDay.reduce((s, d) => s + d.scheduledMinutes, 0)
    const pct = totalScheduled > 0 ? Math.round((totalWorked / totalScheduled) * 100) : 0
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
