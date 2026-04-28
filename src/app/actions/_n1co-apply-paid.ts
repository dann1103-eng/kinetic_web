/**
 * Helper privado usado por el webhook handler de n1co para aplicar
 * "factura pagada" a partir de un payload `SuccessPayment`/`SubscriptionPayment`.
 *
 * No es server action — se llama directamente desde route.ts.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markInvoicePaidCore } from '@/lib/domain/invoice-paid'

export async function applyN1coPaidFromWebhook(
  invoiceId: string,
  payload: Record<string, unknown>,
  supabase?: SupabaseClient,
): Promise<void> {
  // El caller pasa supabase admin; si no, lo lee del módulo (no debería ocurrir).
  if (!supabase) {
    const mod = await import('@/lib/supabase/admin')
    supabase = mod.createAdminClient()
  }

  const orderId = stringOrNull(payload, 'orderId')
  const md = (payload as { metadata?: Record<string, unknown> }).metadata ?? null
  const buyerEmail = mdString(md, 'BuyerEmail', 'buyerEmail')
  const buyerName = mdString(md, 'BuyerName', 'buyerName')
  const transactionDate = mdString(md, 'TransactionDate', 'transactionDate')

  const result = await markInvoicePaidCore(supabase!, {
    invoiceId,
    paymentMethod: 'card',
    paymentReference: orderId,
    n1co: {
      orderId,
      buyerEmail,
      buyerName,
      paidAt: transactionDate ?? new Date().toISOString(),
    },
  })

  if (!result.ok) {
    throw new Error(result.error ?? 'No se pudo aplicar pago n1co')
  }
}

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
