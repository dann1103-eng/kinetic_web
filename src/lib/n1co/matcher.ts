/**
 * Matching de eventos de webhook n1co a entidades del CRM.
 *
 * Estrategias en orden de prioridad:
 *   1. order_reference  — payload.orderReference matchea invoices.n1co_order_reference
 *   2. subscription_id  — payload.subscriptionId matchea clients.n1co_subscription_id
 *   3. email            — metadata.BuyerEmail matchea clients.contact_email (link estático)
 *   4. orphan           — sin match, va a /billing/orphan-payments
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { N1coMatchingStrategy } from '@/types/db'

export interface MatchResult {
  invoiceId: string | null
  clientId: string | null
  strategy: N1coMatchingStrategy
}

/** Lee un campo string de metadata sin importar mayúsculas. */
function metaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!meta) return null
  for (const key of keys) {
    const v = meta[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

interface RawPayload {
  type?: string
  orderId?: string | number
  orderReference?: string
  subscriptionId?: string | number
  metadata?: Record<string, unknown>
}

export async function matchN1coEvent(
  supabase: SupabaseClient,
  payload: RawPayload,
): Promise<MatchResult> {
  // 1. Match por orderReference (link dinámico por factura)
  const orderRef =
    typeof payload.orderReference === 'string' ? payload.orderReference : null
  if (orderRef) {
    const { data } = await supabase
      .from('invoices')
      .select('id, client_id')
      .eq('n1co_order_reference', orderRef)
      .maybeSingle()
    if (data) {
      return { invoiceId: data.id as string, clientId: data.client_id as string, strategy: 'order_reference' }
    }
  }

  // 2. Match por subscription_id (suscripciones)
  const subId =
    payload.subscriptionId !== undefined && payload.subscriptionId !== null
      ? String(payload.subscriptionId)
      : null
  if (subId) {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('n1co_subscription_id', subId)
      .maybeSingle()
    if (data) {
      // Para suscripciones, factura = la 'issued' más reciente del cliente (si existe).
      const { data: inv } = await supabase
        .from('invoices')
        .select('id')
        .eq('client_id', data.id)
        .eq('status', 'issued')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return {
        invoiceId: (inv?.id as string) ?? null,
        clientId: data.id as string,
        strategy: 'subscription_id',
      }
    }
  }

  // 3. Match por BuyerEmail (link estático)
  const buyerEmail = metaString(payload.metadata, 'BuyerEmail', 'buyerEmail')
  if (buyerEmail) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .ilike('contact_email', buyerEmail)
      .limit(2)
    if (clients && clients.length === 1) {
      const clientId = clients[0].id as string
      // Factura abierta más antigua del cliente (status='issued').
      const { data: inv } = await supabase
        .from('invoices')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'issued')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return {
        invoiceId: (inv?.id as string) ?? null,
        clientId,
        strategy: 'email',
      }
    }
  }

  // 4. Sin match
  return { invoiceId: null, clientId: null, strategy: 'orphan' }
}
