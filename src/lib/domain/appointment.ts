/**
 * Helpers de dominio para citas (appointments) — Kinetic Fase 2.
 *
 * Funciones puras que se reusan en validación cliente, generación de
 * placeholders en forms y derivaciones de UI.
 */

import type { AppointmentStatus, EventType, InstitutionalClosure } from '@/types/db'

/** Duración default por tipo de evento (en minutos). */
export function defaultDurationMinutes(eventType: EventType): number {
  switch (eventType) {
    case 'terapia':
      return 30
    case 'evaluacion':
      return 60
    case 'entrevista_directora':
    case 'reunion_padres':
    case 'reunion_colegio':
      return 60
    case 'programa_matutino':
      return 240 // 4h, jornada matutina completa
  }
}

/**
 * Detecta si dos rangos de tiempo se solapan.
 * Igualdad en bordes NO se considera solapamiento (back-to-back está OK).
 */
export function appointmentsOverlap(
  a: { starts_at: string; ends_at: string },
  b: { starts_at: string; ends_at: string },
): boolean {
  const aStart = new Date(a.starts_at).getTime()
  const aEnd = new Date(a.ends_at).getTime()
  const bStart = new Date(b.starts_at).getTime()
  const bEnd = new Date(b.ends_at).getTime()
  return aStart < bEnd && bStart < aEnd
}

/**
 * Devuelve el cierre institucional que afecta la cita, o null.
 * Considera year_recurring (mismo MM-DD en cualquier año).
 */
export function findClosureAffecting(
  startsAt: string,
  closures: ReadonlyArray<InstitutionalClosure>,
): InstitutionalClosure | null {
  const dt = new Date(startsAt)
  const ymd = dt.toISOString().slice(0, 10)
  const mmdd = ymd.slice(5)

  for (const c of closures) {
    if (c.year_recurring) {
      if (c.date.slice(5) === mmdd) return c
    } else if (c.date === ymd) {
      return c
    }
  }
  return null
}

/**
 * Formatea hora para display ("9:30 a.m.").
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Formatea fecha+hora para display ("vie. 8 may, 9:30 a.m.").
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Status colors usando los tokens --fm-* (Tailwind). */
export const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-fm-primary/10 text-fm-primary',
  in_progress: 'bg-fm-secondary/15 text-fm-secondary',
  completed: 'bg-fm-tertiary/15 text-fm-tertiary',
  no_show: 'bg-fm-error/10 text-fm-error',
  late_cancel: 'bg-fm-error/10 text-fm-error',
  rescheduled: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  replacement: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  cancelled: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
}

/**
 * Color asociado a un event_type para usar en celda de calendar.
 * Devuelve clases de Tailwind (background + text).
 */
export const EVENT_TYPE_COLORS: Record<EventType, { bg: string; text: string; border: string }> = {
  terapia: { bg: 'bg-fm-primary/15', text: 'text-fm-primary', border: 'border-fm-primary/30' },
  evaluacion: { bg: 'bg-fm-secondary/20', text: 'text-fm-secondary', border: 'border-fm-secondary/40' },
  entrevista_directora: { bg: 'bg-fm-tertiary/15', text: 'text-fm-tertiary', border: 'border-fm-tertiary/30' },
  reunion_padres: { bg: 'bg-fm-tertiary/15', text: 'text-fm-tertiary', border: 'border-fm-tertiary/30' },
  reunion_colegio: { bg: 'bg-fm-on-surface-variant/15', text: 'text-fm-on-surface-variant', border: 'border-fm-on-surface-variant/30' },
  programa_matutino: { bg: 'bg-fm-secondary/15', text: 'text-fm-secondary', border: 'border-fm-secondary/30' },
}

/** Cálculo de "minutos hasta una cita" para mostrar/ocultar el botón "Unirse". */
export function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - new Date().getTime()) / 60000)
}

/** ¿La cita es "joinable" ahora? (entre 10 min antes y 5 min después de ends_at) */
export function isJoinable(startsAt: string, endsAt: string): boolean {
  const minsToStart = minutesUntil(startsAt)
  const minsToEnd = minutesUntil(endsAt)
  return minsToStart <= 10 && minsToEnd >= -5
}
