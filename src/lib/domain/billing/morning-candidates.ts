/**
 * Genera las citas candidatas de un niño en un programa matutino (por grupo),
 * para un mes dado. Una cita por cada día del mes cuyo día de la semana está en
 * `attendanceDays`, a la hora del grupo, saltando feriados.
 *
 * Función pura (testeable sin Supabase). El server le pasa el horario del grupo
 * y los feriados del mes; reutiliza la zona SV como el resto de los ciclos.
 */

import { fromZonedTime } from 'date-fns-tz'
import type { MorningProgram } from '@/types/db'

const TZ = 'America/El_Salvador'

// extract(dow) de Postgres: 0=domingo … 6=sábado. getDay() de JS es igual.
const DOW_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export interface MorningCandidate {
  service: MorningProgram
  starts_at: string // ISO UTC
  ends_at: string // ISO UTC
  duration_minutes: number
  therapist_id: string | null
}

export interface MorningGroupSchedule {
  program: MorningProgram
  /** Hora de inicio en SV, 'HH:MM'. */
  start_time_local: string
  duration_minutes: number
  /** Maestra líder del grupo (therapist_id de la cita). */
  therapist_id: string | null
}

/** '2026-07' o '2026-07-01' → { y, m } (m es 1-indexed). */
function parsePeriod(periodMonth: string): { y: number; m: number } {
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  return { y, m }
}

/** Cantidad de días del mes. */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** 'YYYY-MM-DD' de un día del mes. */
function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function computeMorningCandidates(params: {
  group: MorningGroupSchedule
  attendanceDays: string[]
  periodMonth: string
  /** Feriados/cierres del mes como claves 'YYYY-MM-DD' (zona SV). */
  holidays: string[]
}): MorningCandidate[] {
  const { group, attendanceDays, periodMonth, holidays } = params
  if (attendanceDays.length === 0) return []

  const { y, m } = parsePeriod(periodMonth)
  const days = daysInMonth(y, m)
  const holidaySet = new Set(holidays)
  const [hh, mm] = group.start_time_local.split(':').map(Number)

  const out: MorningCandidate[] = []
  for (let d = 1; d <= days; d++) {
    // getDay() en una fecha "local" (mediodía evita corrimientos por DST/zonas).
    const dow = DOW_CODES[new Date(y, m - 1, d, 12, 0, 0).getDay()]
    if (!attendanceDays.includes(dow)) continue
    if (holidaySet.has(dateKey(y, m, d))) continue

    const start = fromZonedTime(new Date(y, m - 1, d, hh, mm, 0), TZ)
    const end = new Date(start.getTime() + group.duration_minutes * 60_000)
    out.push({
      service: group.program,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      duration_minutes: group.duration_minutes,
      therapist_id: group.therapist_id,
    })
  }
  return out
}
