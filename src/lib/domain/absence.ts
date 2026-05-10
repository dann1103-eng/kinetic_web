/**
 * Helpers de dominio para inasistencias (appointment_absences) — Kinetic Fase 4.
 *
 * Funciones puras para evaluar si una ausencia ya pasó la ventana en la que
 * se permite crear una reposición. Si la ausencia está vencida, la única
 * resolución posible es waive (no reponer).
 */

/** Días desde el reporte tras los cuales una ausencia ya no se puede reponer. */
export const REPLACEMENT_WINDOW_DAYS = 30

/** Umbral para mostrar el badge "próxima a vencer" en la UI. */
export const REPLACEMENT_WARNING_DAYS = 20

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Días enteros transcurridos desde `reportedAt` hasta `now`. */
export function daysSinceReported(reportedAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(reportedAt).getTime()
  return Math.floor(ms / MS_PER_DAY)
}

/** ¿La ventana de reposición ya venció para esta ausencia? */
export function isAbsenceExpired(reportedAt: string, now: Date = new Date()): boolean {
  return daysSinceReported(reportedAt, now) > REPLACEMENT_WINDOW_DAYS
}

/** ¿La ventana de reposición está por vencer (entre WARNING y WINDOW)? */
export function isAbsenceNearExpiry(reportedAt: string, now: Date = new Date()): boolean {
  const days = daysSinceReported(reportedAt, now)
  return days >= REPLACEMENT_WARNING_DAYS && days <= REPLACEMENT_WINDOW_DAYS
}
