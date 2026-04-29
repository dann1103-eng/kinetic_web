/**
 * Helpers para créditos del cliente sin caducidad.
 *
 * Modelo:
 *   - Una factura con `extras_metadata` poblado se considera "paquete extra".
 *   - Al pagar la factura, `grantCreditsFromInvoice` materializa una fila en
 *     `client_credits` con `qty_remaining = qty`.
 *   - Los créditos se consumen vía `consumeCredit` (FIFO por `created_at`).
 *   - Al anular un consumo (cambio anulado, requerimiento voided), se llama
 *     `refundCredit` para devolver +1 al crédito original.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ClientCredit,
  ContentType,
  CreditKind,
  InvoiceExtrasMetadata,
} from '@/types/db'
import { CONTENT_TYPE_TO_CREDIT_KIND, CREDIT_KIND_TO_CONTENT_TYPE } from '@/types/db'

/**
 * Materializa los créditos correspondientes a una factura pagada.
 * Idempotente — el unique index `(source_invoice_id, kind)` evita duplicados.
 * Solo opera si `invoice.extras_metadata` está poblado.
 */
export async function grantCreditsFromInvoice(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true; credits: ClientCredit[] } | { ok: false; error: string }> {
  const { data: inv } = await admin
    .from('invoices')
    .select('id, client_id, total_a_pagar, extras_metadata')
    .eq('id', invoiceId)
    .single()
  if (!inv) return { ok: false, error: 'Factura no encontrada' }

  const meta = inv.extras_metadata as InvoiceExtrasMetadata | null
  if (!meta || !meta.kind || meta.qty == null || meta.qty <= 0) {
    return { ok: true, credits: [] } // No es un paquete extra; nada que materializar
  }

  let kind: CreditKind | null = null
  if (meta.kind === 'cambios') {
    kind = 'cambios'
  } else if (meta.kind === 'content' && meta.content_type) {
    kind = CONTENT_TYPE_TO_CREDIT_KIND[meta.content_type] ?? null
  }
  if (!kind) {
    return { ok: false, error: `Tipo de paquete no soportado: ${meta.kind}/${meta.content_type ?? '-'}` }
  }

  const unit = meta.qty > 0 ? Number(inv.total_a_pagar ?? 0) / meta.qty : 0

  const { data: inserted, error } = await admin
    .from('client_credits')
    .upsert(
      {
        client_id: inv.client_id as string,
        kind,
        qty_initial: meta.qty,
        qty_remaining: meta.qty,
        unit_price_usd: Math.round(unit * 100) / 100,
        source_invoice_id: invoiceId,
      },
      { onConflict: 'source_invoice_id,kind', ignoreDuplicates: true },
    )
    .select('*')
  if (error) return { ok: false, error: error.message }

  return { ok: true, credits: (inserted ?? []) as ClientCredit[] }
}

/**
 * Consume 1 unidad de un crédito disponible para el cliente y kind dados.
 * Estrategia: FIFO por `created_at`. Atómico (decremento condicional).
 * Devuelve el `id` del crédito usado o null si no hay disponibles.
 */
export async function consumeCredit(
  admin: SupabaseClient,
  args: { clientId: string; kind: CreditKind },
): Promise<string | null> {
  // Buscar el crédito más antiguo con saldo
  const { data: candidate } = await admin
    .from('client_credits')
    .select('id, qty_remaining')
    .eq('client_id', args.clientId)
    .eq('kind', args.kind)
    .gt('qty_remaining', 0)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!candidate?.id) return null

  // Decrementar (con guard para evitar carrera)
  const { data: updated, error } = await admin
    .from('client_credits')
    .update({ qty_remaining: (candidate.qty_remaining as number) - 1 })
    .eq('id', candidate.id)
    .eq('qty_remaining', candidate.qty_remaining as number)
    .select('id')
    .maybeSingle()
  if (error || !updated?.id) return null
  return updated.id as string
}

/** Devuelve +1 a un crédito específico (anulación). */
export async function refundCredit(
  admin: SupabaseClient,
  creditId: string,
): Promise<boolean> {
  const { data: c } = await admin
    .from('client_credits')
    .select('qty_remaining, qty_initial')
    .eq('id', creditId)
    .maybeSingle()
  if (!c) return false
  const next = Math.min((c.qty_remaining as number) + 1, c.qty_initial as number)
  const { error } = await admin
    .from('client_credits')
    .update({ qty_remaining: next })
    .eq('id', creditId)
  return !error
}

/**
 * Suma de créditos disponibles por content_type para un cliente.
 * Útil al validar `canRegister` de un nuevo requerimiento.
 */
export async function getAvailableContentCredits(
  client: SupabaseClient,
  clientId: string,
): Promise<Partial<Record<ContentType, number>>> {
  const { data } = await client
    .from('client_credits')
    .select('kind, qty_remaining')
    .eq('client_id', clientId)
    .gt('qty_remaining', 0)
  const result: Partial<Record<ContentType, number>> = {}
  for (const row of (data ?? []) as Array<{ kind: CreditKind; qty_remaining: number }>) {
    const ct = CREDIT_KIND_TO_CONTENT_TYPE[row.kind]
    if (!ct) continue
    result[ct] = (result[ct] ?? 0) + row.qty_remaining
  }
  return result
}

/** Cuántos cambios extras (sin caducidad) tiene el cliente. */
export async function getAvailableCambiosCredits(
  client: SupabaseClient,
  clientId: string,
): Promise<number> {
  const { data } = await client
    .from('client_credits')
    .select('qty_remaining')
    .eq('client_id', clientId)
    .eq('kind', 'cambios')
    .gt('qty_remaining', 0)
  return (data ?? []).reduce((sum, r) => sum + (r.qty_remaining as number), 0)
}
