/**
 * Router de eventos de webhook n1co.
 *
 * Persistencia de eventos: SIEMPRE (incluso firma inválida) — auditoría completa.
 * Idempotencia: chequea si ya hay un evento procesado con (order_id, event_type)
 *               antes de aplicar cambios.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { matchN1coEvent, type MatchResult } from './matcher'

interface PersistArgs {
  supabase: SupabaseClient
  payload: Record<string, unknown>
  signature: string | null
  signatureValid: boolean
}

/** Persiste el evento en n1co_payment_events. Devuelve el id de la fila insertada. */
export async function persistN1coEvent({
  supabase,
  payload,
  signature,
  signatureValid,
}: PersistArgs): Promise<string> {
  const eventType = String((payload as { type?: unknown }).type ?? 'unknown')
  const md = (payload as { metadata?: Record<string, unknown> }).metadata ?? null

  const orderId = stringOrNull(payload, 'orderId')
  const orderReference = stringOrNull(payload, 'orderReference')
  const subscriptionId = stringOrNull(payload, 'subscriptionId')

  const buyerEmail = mdString(md, 'BuyerEmail', 'buyerEmail')
  const buyerName = mdString(md, 'BuyerName', 'buyerName')
  const buyerPhone = mdString(md, 'BuyerPhone', 'buyerPhone')
  const buyerExternalId = mdString(md, 'BuyerExternalId', 'buyerExternalId')

  const { data, error } = await supabase
    .from('n1co_payment_events')
    .insert({
      event_type: eventType,
      order_id: orderId,
      order_reference: orderReference,
      subscription_id: subscriptionId,
      buyer_email: buyerEmail,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      buyer_external_id: buyerExternalId,
      metadata_json: md,
      raw_payload_json: payload,
      hmac_signature: signature,
      signature_valid: signatureValid,
      processed: false,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Failed to persist n1co event: ${error?.message}`)
  return data.id as string
}

/**
 * Idempotencia: ¿ya procesamos un evento con este (order_id|subscription_id, event_type)?
 * Si sí, regresamos el invoiceId para devolver al caller.
 */
export async function alreadyProcessed(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  currentEventId: string,
): Promise<{ matchedInvoiceId: string | null } | null> {
  const eventType = String((payload as { type?: unknown }).type ?? '')
  const orderId = stringOrNull(payload, 'orderId')
  const subscriptionId = stringOrNull(payload, 'subscriptionId')

  // Solo deduplicamos eventos que tienen un identificador estable
  if (!orderId && !subscriptionId) return null

  let q = supabase
    .from('n1co_payment_events')
    .select('id, matched_invoice_id')
    .eq('event_type', eventType)
    .eq('processed', true)
    .neq('id', currentEventId)
    .limit(1)

  if (orderId) q = q.eq('order_id', orderId)
  else if (subscriptionId) q = q.eq('subscription_id', subscriptionId)

  const { data } = await q.maybeSingle()
  if (!data) return null
  return { matchedInvoiceId: (data.matched_invoice_id as string) ?? null }
}

export interface RouteResult extends MatchResult {
  processed: boolean
  error: string | null
}

/**
 * Ejecuta la lógica de matching + actualizar la factura cuando aplique.
 * El caller del handler debe persistir el evento ANTES y después actualizar la
 * fila con el resultado de esta función.
 */
export async function routeN1coEvent(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  applyPaid: (invoiceId: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<RouteResult> {
  const eventType = String((payload as { type?: unknown }).type ?? '')

  const match = await matchN1coEvent(supabase, payload as Parameters<typeof matchN1coEvent>[1])

  // Eventos terminales: SuccessPayment + SubscriptionPayment → marcar factura pagada
  const isPaymentSuccess =
    eventType === 'SuccessPayment' || eventType === 'SubscriptionPayment'

  if (isPaymentSuccess && match.invoiceId) {
    try {
      await applyPaid(match.invoiceId, payload)
      return { ...match, processed: true, error: null }
    } catch (err) {
      return {
        ...match,
        processed: false,
        error: err instanceof Error ? err.message : 'Unknown error in applyPaid',
      }
    }
  }

  // Eventos de suscripción: actualizar estado del cliente
  if (eventType === 'SubscriptionConfirmation' && match.clientId) {
    await supabase
      .from('clients')
      .update({
        n1co_subscription_status: 'Active',
        n1co_subscription_started_at: new Date().toISOString(),
      })
      .eq('id', match.clientId)
    return { ...match, processed: true, error: null }
  }

  if (eventType === 'SubscriptionCancelled' && match.clientId) {
    await supabase
      .from('clients')
      .update({
        n1co_subscription_status: 'Cancelled',
        n1co_subscription_cancelled_at: new Date().toISOString(),
      })
      .eq('id', match.clientId)
    return { ...match, processed: true, error: null }
  }

  // Eventos informativos: registrar pero no aplicar cambios
  // (PaymentError, SuccessReverse, ThreeDSecure*, Created, Updated, etc.)
  return { ...match, processed: true, error: null }
}

// ── helpers ──────────────────────────────────────────────────

function stringOrNull(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

function mdString(md: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!md) return null
  for (const key of keys) {
    const v = md[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
