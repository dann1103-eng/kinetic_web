/**
 * Sincronización de planes del CRM hacia n1co.
 *
 * Limitación: la API pública de n1co solo expone POST /api/v3/Plans (create) y GETs.
 * No hay PATCH/PUT/DELETE — los planes son inmutables una vez creados. Cualquier
 * cambio significativo (precio, ciclo) requiere crear un plan nuevo en n1co y
 * migrar suscripciones futuras al nuevo.
 */

import { n1coRequest } from './client'
import type { CreatePlanInput, N1coBillingCycleType, N1coPlan } from './types'
import type { BillingPeriod, Plan } from '@/types/db'

export function createN1coPlan(input: CreatePlanInput) {
  return n1coRequest<N1coPlan>({
    method: 'POST',
    path: '/api/v3/Plans',
    body: input,
  })
}

export function listN1coPlans() {
  return n1coRequest<N1coPlan[]>({
    method: 'GET',
    path: '/api/v3/Plans/all',
  })
}

export function getN1coPlan(planId: string | number) {
  return n1coRequest<N1coPlan>({
    method: 'GET',
    path: `/api/v3/Plans/${planId}`,
  })
}

/**
 * Mapea un plan del CRM al formato esperado por n1co.
 * - billing_period 'monthly' → Month × 1
 * - billing_period 'biweekly' → Week × 2 (con caveat de drift; ver plan)
 */
export function mapCrmPlanToN1co(args: {
  plan: Pick<Plan, 'name' | 'price_usd'>
  billingPeriod: BillingPeriod
  /** billing_day del cliente (1-27 o 31). Solo aplica a monthly. */
  billingDay?: number | null
  locationId: number
  termsAndConditions?: string
}): CreatePlanInput {
  const cycle: { type: N1coBillingCycleType; n: number } =
    args.billingPeriod === 'biweekly'
      ? { type: 'Week', n: 2 }
      : { type: 'Month', n: 1 }

  return {
    name: args.plan.name,
    description: `${args.plan.name} — FM Communications`,
    amount: args.plan.price_usd,
    billingCycleType: cycle.type,
    billingCyclesNumber: cycle.n,
    billingDay: cycle.type === 'Month' && args.billingDay && args.billingDay >= 1 && args.billingDay <= 27
      ? args.billingDay
      : null,
    locationId: args.locationId,
    termsAndConditions: args.termsAndConditions,
  }
}
