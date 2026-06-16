/**
 * cycle-edit.ts — Lógica pura para editar un ciclo mensual ya generado.
 *
 * Solo se puede editar un ciclo en estado `generated` + `payment_status='pending'`
 * (factura emitida sin pagar). Los pagados/anulados quedan inmutables.
 *
 * El monto del ciclo se recalcula igual que al generarlo: subtotal de las terapias
 * (mensualidad fija = 1 × precio; per_session = sesiones × precio) menos el descuento.
 */
import type { ServiceType, TherapyBillingMode } from '@/types/db'
import { applyDiscount, type Discount } from '../discounts'
import { therapyLineAmount } from './monthly-flat'

export interface PricedTherapyInput {
  service: string
  sessions_per_month: number
  unit_cost_usd: number
  billing_mode?: TherapyBillingMode
}

/** Subtotal del ciclo: suma de las líneas de terapia (BK-aware). */
export function pricedSubtotal(priced: PricedTherapyInput[]): number {
  const sum = priced.reduce(
    (s, t) =>
      s +
      therapyLineAmount({
        service: t.service as ServiceType,
        billing_mode: t.billing_mode,
        sessions_per_month: t.sessions_per_month,
        unit_cost_usd: t.unit_cost_usd,
      }),
    0,
  )
  return Math.round(sum * 100) / 100
}

/** Monto esperado del ciclo = subtotal − descuento. */
export function expectedCycleAmount(priced: PricedTherapyInput[], discount: Discount): number {
  return applyDiscount(pricedSubtotal(priced), discount)
}

export interface EditableCycleState {
  status: 'paid_pending_generation' | 'generated' | 'cancelled'
  payment_status: 'pending' | 'paid'
}

/** ¿El ciclo se puede editar? Solo generados y aún pendientes de pago. */
export function isCycleEditable(cycle: EditableCycleState): boolean {
  return cycle.status === 'generated' && cycle.payment_status === 'pending'
}
