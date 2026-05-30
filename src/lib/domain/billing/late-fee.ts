/**
 * Lógica pura de recargo por mora y estado de pago del ciclo mensual.
 *
 * Reglas (decisión del cliente):
 *   - La familia tiene hasta el día 5 del mes para pagar (periodo de gracia
 *     por defecto). Ese vencimiento se setea al emitir la factura y puede
 *     prorrogarse manualmente con justificación.
 *   - Pasado el vencimiento, se cobra 5% SIMPLE sobre el total original por
 *     cada bloque de 5 días de atraso: día +1..+5 = 5%, +6..+10 = 10%, etc.
 *   - El recargo se calcula contra la fecha de gracia EFECTIVA
 *     (grace_extended_to ?? due_date).
 *
 * Todas las fechas se manejan como 'YYYY-MM-DD' (día calendario, sin hora).
 */

export const DEFAULT_GRACE_DAY = 5
export const SURCHARGE_PCT_PER_BLOCK = 5
export const SURCHARGE_BLOCK_DAYS = 5

/** 'YYYY-MM-01' (o 'YYYY-MM') → fecha de gracia 'YYYY-MM-DD' (día `graceDay`). */
export function computeGraceDate(periodMonth: string, graceDay: number = DEFAULT_GRACE_DAY): string {
  const ym = periodMonth.slice(0, 7) // 'YYYY-MM'
  const day = String(Math.max(1, Math.min(28, Math.floor(graceDay)))).padStart(2, '0')
  return `${ym}-${day}`
}

/** Diferencia en días calendario (b - a). Positivo si b es posterior. */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T00:00:00Z`)
  const db = Date.parse(`${b.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.round((db - da) / 86_400_000)
}

/** Fecha de gracia efectiva: la prórroga si existe, si no el vencimiento. */
export function effectiveGraceDate(
  dueDate: string | null | undefined,
  graceExtendedTo: string | null | undefined,
): string | null {
  if (graceExtendedTo) return graceExtendedTo.slice(0, 10)
  return dueDate ? dueDate.slice(0, 10) : null
}

export interface SurchargeResult {
  /** Días pasados desde la fecha de gracia efectiva (0 si aún no vence). */
  daysLate: number
  /** Bloques de 5 días de atraso (0 si está al día). */
  blocks: number
  /** Porcentaje de recargo (blocks × 5). */
  pct: number
  /** Monto del recargo en USD (redondeado a 2 decimales). */
  amount: number
}

/**
 * Recargo a una fecha dada (normalmente la fecha de pago, o hoy si no pagó).
 * @param originalTotal total original de la factura (sin recargo)
 * @param effectiveGrace fecha de gracia efectiva 'YYYY-MM-DD'
 * @param asOf fecha contra la que se mide el atraso 'YYYY-MM-DD'
 */
export function computeSurcharge(
  originalTotal: number,
  effectiveGrace: string | null,
  asOf: string,
): SurchargeResult {
  if (!effectiveGrace || !Number.isFinite(originalTotal) || originalTotal <= 0) {
    return { daysLate: 0, blocks: 0, pct: 0, amount: 0 }
  }
  const daysLate = daysBetween(effectiveGrace, asOf)
  if (daysLate <= 0) return { daysLate: 0, blocks: 0, pct: 0, amount: 0 }
  const blocks = Math.ceil(daysLate / SURCHARGE_BLOCK_DAYS)
  const pct = blocks * SURCHARGE_PCT_PER_BLOCK
  const amount = Math.round(originalTotal * (pct / 100) * 100) / 100
  return { daysLate, blocks, pct, amount }
}

export type PaymentTagState = 'paid' | 'due' | 'overdue' | 'none'

export interface PaymentTagInfo {
  state: PaymentTagState
  /** Días que faltan para el vencimiento (solo si state='due'). */
  daysRemaining: number
  /** Días de atraso desde el vencimiento (solo si state='overdue'). */
  daysOverdue: number
}

/**
 * Estado de pago para el tag en la card del niño/a.
 * @param dueDate fecha de gracia efectiva 'YYYY-MM-DD' (o null si no hay ciclo)
 * @param isPaid si el ciclo del mes ya fue pagado
 * @param asOf hoy 'YYYY-MM-DD'
 */
export function paymentTagInfo(
  dueDate: string | null,
  isPaid: boolean,
  asOf: string,
): PaymentTagInfo {
  if (isPaid) return { state: 'paid', daysRemaining: 0, daysOverdue: 0 }
  if (!dueDate) return { state: 'none', daysRemaining: 0, daysOverdue: 0 }
  const diff = daysBetween(asOf, dueDate) // due - hoy
  if (diff >= 0) return { state: 'due', daysRemaining: diff, daysOverdue: 0 }
  return { state: 'overdue', daysRemaining: 0, daysOverdue: -diff }
}
