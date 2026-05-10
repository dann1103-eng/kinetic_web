/**
 * Sugeridor de slots libres para reposiciones — Kinetic Fase 4.
 *
 * Función pura que dado un terapista, su agenda existente, los cierres
 * institucionales y una ventana de fechas, devuelve slots libres
 * candidatos para una reposición.
 *
 * Estrategia: barrer la grilla de horas hábiles (8:00–18:00) en TZ local
 * en pasos de 15 min, y para cada candidato verificar que no se solape
 * con ninguna cita existente del terapista y que no caiga en un cierre.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { appointmentsOverlap, findClosureAffecting } from './appointment'
import type { InstitutionalClosure } from '@/types/db'

const TZ = 'America/El_Salvador'

/** Horas hábiles en TZ local. Slots solo se sugieren dentro de esta franja. */
const BUSINESS_HOUR_START = 8
const BUSINESS_HOUR_END = 18

/** Granularidad de la grilla de slots candidatos (en minutos). */
const SLOT_STEP_MINUTES = 15

/** Máximo de sugerencias a devolver. */
const DEFAULT_MAX_SUGGESTIONS = 8

export interface SuggestSlotsInput {
  /** Citas existentes del terapista en la ventana (cualquier estado activo). */
  existingAppointments: ReadonlyArray<{ starts_at: string; ends_at: string }>
  /** Cierres institucionales aplicables a la ventana. */
  closures: ReadonlyArray<InstitutionalClosure>
  /** Duración del slot en minutos (igual a la cita original por default). */
  durationMinutes: number
  /** Inicio de la ventana de búsqueda (ISO). */
  windowStart: string
  /** Fin de la ventana de búsqueda (ISO, exclusivo). */
  windowEnd: string
  /** Máximo de sugerencias a retornar. */
  limit?: number
}

export interface SuggestedSlot {
  starts_at: string
  ends_at: string
}

/**
 * Genera la lista de slots candidatos en la ventana, alineados a la grilla
 * y dentro de las horas hábiles en TZ local.
 */
function* iterateCandidateSlots(windowStart: Date, windowEnd: Date, durationMin: number) {
  const stepMs = SLOT_STEP_MINUTES * 60 * 1000
  const durationMs = durationMin * 60 * 1000

  // Empezamos desde el siguiente múltiplo de 15 min en TZ local.
  const localStart = toZonedTime(windowStart, TZ)
  const minutes = localStart.getMinutes()
  const remainder = minutes % SLOT_STEP_MINUTES
  if (remainder !== 0) {
    localStart.setMinutes(minutes + (SLOT_STEP_MINUTES - remainder), 0, 0)
  } else {
    localStart.setSeconds(0, 0)
  }

  let cursor = fromZonedTime(localStart, TZ).getTime()
  const endMs = windowEnd.getTime()

  while (cursor + durationMs <= endMs) {
    const startsAtUtc = new Date(cursor)
    const endsAtUtc = new Date(cursor + durationMs)
    const startsAtLocal = toZonedTime(startsAtUtc, TZ)
    const hour = startsAtLocal.getHours()
    const endsAtLocal = toZonedTime(endsAtUtc, TZ)
    // Mismo día local + dentro de horas hábiles + finaliza antes del cierre.
    const sameDay =
      startsAtLocal.getFullYear() === endsAtLocal.getFullYear() &&
      startsAtLocal.getMonth() === endsAtLocal.getMonth() &&
      startsAtLocal.getDate() === endsAtLocal.getDate()
    const endHour = endsAtLocal.getHours()
    const endMinute = endsAtLocal.getMinutes()
    const finishesByClose =
      endHour < BUSINESS_HOUR_END || (endHour === BUSINESS_HOUR_END && endMinute === 0)

    if (sameDay && hour >= BUSINESS_HOUR_START && finishesByClose) {
      yield {
        starts_at: startsAtUtc.toISOString(),
        ends_at: endsAtUtc.toISOString(),
      }
    }
    cursor += stepMs
  }
}

/**
 * Sugiere slots libres del terapista para crear una reposición.
 *
 * Reglas:
 *  - Slot debe estar entre 8:00 y 18:00 hora local (El Salvador)
 *  - No solapa con `existingAppointments`
 *  - No cae en un día con `institutional_calendar` (incluye recurrentes)
 *  - Solo el mismo día (no abarca medianoche)
 */
export function suggestReplacementSlots(input: SuggestSlotsInput): SuggestedSlot[] {
  const limit = input.limit ?? DEFAULT_MAX_SUGGESTIONS
  const windowStart = new Date(input.windowStart)
  const windowEnd = new Date(input.windowEnd)
  if (windowEnd.getTime() <= windowStart.getTime()) return []
  if (input.durationMinutes <= 0) return []

  const out: SuggestedSlot[] = []

  for (const slot of iterateCandidateSlots(windowStart, windowEnd, input.durationMinutes)) {
    if (findClosureAffecting(slot.starts_at, input.closures)) continue

    let collides = false
    for (const appt of input.existingAppointments) {
      if (appointmentsOverlap(slot, appt)) {
        collides = true
        break
      }
    }
    if (collides) continue

    out.push(slot)
    if (out.length >= limit) break
  }

  return out
}
