/**
 * Helpers para gestionar suscripciones n1co.
 *
 * NOTA IMPORTANTE (PCI):
 *   - La tokenización server-to-server con PAN (POST /api/v3/PaymentMethods con
 *     el número de tarjeta en el body) pone a FM en scope PCI-DSS SAQ-D.
 *   - Estos helpers existen pero NO se deben llamar directamente desde un form
 *     del CRM con el PAN del cliente. Antes de Fase 2 hay que confirmar con
 *     soporte n1co si tienen SDK frontend / iframe hosteado para tokenizar.
 */

import { n1coRequest } from './client'
import type {
  CreateSubscriptionInput,
  CreateSubscriptionResponse,
  N1coSubscriptionData,
} from './types'

export function createSubscription(input: CreateSubscriptionInput) {
  return n1coRequest<CreateSubscriptionResponse>({
    method: 'POST',
    path: '/api/v3/Subscriptions',
    body: input,
  })
}

export function getSubscription(subscriptionId: string | number) {
  return n1coRequest<N1coSubscriptionData>({
    method: 'GET',
    path: `/api/v3/Subscriptions/${subscriptionId}`,
  })
}

export function cancelSubscription(subscriptionId: string | number, reason: string) {
  return n1coRequest<{ subscriptionId: number }>({
    method: 'POST',
    path: `/api/v3/Subscriptions/${subscriptionId}/cancel`,
    body: { reason },
  })
}

export function listSubscriptionOrders(subscriptionId: string | number) {
  return n1coRequest<Array<{
    subscriptionId: number
    planId: number
    orderId: number
    orderName: string
    total: number
    orderStatus: string
    createdDate: string
    createdBy: string
  }>>({
    method: 'GET',
    path: `/api/v3/Subscriptions/${subscriptionId}/orders`,
  })
}
