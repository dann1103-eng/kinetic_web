/**
 * Tarifa por recogida tardía del niño/a tras finalizar la terapia.
 *
 * Regla (decisión del cliente):
 *   - El timer arranca cuando la terapista marca "terapia finalizada".
 *   - 0–15 min: sin cargo (periodo de gracia de recogida).
 *   - Pasados los 15 min: $5.
 *   - Luego +$5 por cada 30 min adicionales (medidos desde el minuto 15).
 *     Ej: 16 min = $5, 45 min = $10, 75 min = $15.
 */

export const PICKUP_GRACE_MINUTES = 15
export const PICKUP_FIRST_FEE_USD = 5
export const PICKUP_BLOCK_MINUTES = 30
export const PICKUP_BLOCK_FEE_USD = 5

export interface LatePickupResult {
  /** Minutos transcurridos entre finalización y despacho. */
  minutes: number
  /** Cargo en USD. 0 si está dentro de la gracia. */
  feeUsd: number
}

/** Minutos entre dos instantes ISO (>=0). */
export function minutesBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO)
  const b = Date.parse(toISO)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.floor((b - a) / 60_000))
}

/** Cargo por recogida tardía dado el # de minutos transcurridos. */
export function latePickupFee(minutes: number): number {
  if (minutes <= PICKUP_GRACE_MINUTES) return 0
  const extra = minutes - PICKUP_GRACE_MINUTES
  const blocks = Math.floor(extra / PICKUP_BLOCK_MINUTES)
  return PICKUP_FIRST_FEE_USD + blocks * PICKUP_BLOCK_FEE_USD
}

/** Calcula minutos + cargo entre finalización (completed_at) y despacho/ahora. */
export function computeLatePickup(completedAtISO: string, asOfISO: string): LatePickupResult {
  const minutes = minutesBetween(completedAtISO, asOfISO)
  return { minutes, feeUsd: latePickupFee(minutes) }
}
