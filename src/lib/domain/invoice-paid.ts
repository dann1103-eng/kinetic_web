/**
 * Lógica core de "marcar factura como pagada".
 * Compartida entre la server action manual (`markInvoicePaid`) y el
 * webhook handler de n1co (`applyN1coPaidFromWebhook`).
 *
 * No verifica auth — el caller es responsable de eso.
 * Recibe siempre un Supabase client (admin/service-role para el webhook).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildClientSnapshot,
  buildEmitterSnapshot,
  calculateTotals,
  suggestItemsFromPlan,
} from '@/lib/domain/invoices'
import { invoicePeriodLabel } from '@/lib/domain/billing'
import { today as todayString } from '@/lib/domain/dates'
import type {
  BillingCycle,
  Client,
  CompanySettings,
  InvoicePaymentMethod,
  Plan,
} from '@/types/db'

export interface MarkInvoicePaidCoreInput {
  invoiceId: string
  paymentMethod: InvoicePaymentMethod
  paymentDate?: string
  paymentReference?: string | null
  /** Campos adicionales para webhooks de n1co. */
  n1co?: {
    orderId?: string | null
    paymentLinkId?: string | null
    buyerEmail?: string | null
    buyerName?: string | null
    paidAt?: string | null
  }
}

export interface MarkInvoicePaidCoreResult {
  ok: boolean
  error?: string
  clientId?: string
  cycleId?: string | null
  biweeklyHalf?: 'first' | 'second' | null
  generatedSecondInvoiceId?: string | null
}

export async function markInvoicePaidCore(
  admin: SupabaseClient,
  input: MarkInvoicePaidCoreInput,
): Promise<MarkInvoicePaidCoreResult> {
  const { data: inv } = await admin
    .from('invoices')
    .select('id, client_id, billing_cycle_id, biweekly_half, status, payment_provider')
    .eq('id', input.invoiceId)
    .single()
  if (!inv) return { ok: false, error: 'Factura no encontrada' }

  // Idempotencia local: si ya está pagada no la tocamos
  if (inv.status === 'paid') {
    return {
      ok: true,
      clientId: inv.client_id as string,
      cycleId: (inv.billing_cycle_id as string) ?? null,
      biweeklyHalf: (inv.biweekly_half as 'first' | 'second' | null) ?? null,
      generatedSecondInvoiceId: null,
    }
  }

  const payDate = input.paymentDate ?? todayString()

  const updatePayload: Record<string, unknown> = {
    status: 'paid',
    payment_method: input.paymentMethod,
    payment_date: payDate,
    payment_reference: input.paymentReference ?? null,
  }
  if (input.n1co) {
    if (input.n1co.orderId !== undefined) updatePayload.n1co_order_id = input.n1co.orderId
    if (input.n1co.paymentLinkId !== undefined) updatePayload.n1co_payment_link_id = input.n1co.paymentLinkId
    if (input.n1co.buyerEmail !== undefined) updatePayload.n1co_buyer_email = input.n1co.buyerEmail
    if (input.n1co.buyerName !== undefined) updatePayload.n1co_buyer_name = input.n1co.buyerName
    if (input.n1co.paidAt !== undefined) updatePayload.n1co_paid_at = input.n1co.paidAt
  }

  const { error } = await admin.from('invoices').update(updatePayload).eq('id', input.invoiceId)
  if (error) return { ok: false, error: 'Error al marcar la factura como pagada' }

  let generatedSecondInvoiceId: string | null = null

  // Sincronizar billing_cycle según biweekly_half
  if (inv.billing_cycle_id) {
    const halfUpdate =
      inv.biweekly_half === 'second'
        ? { payment_status_2: 'paid' as const, payment_date_2: payDate }
        : inv.biweekly_half === 'first'
          ? { payment_status: 'paid' as const, payment_date: payDate }
          : {
              payment_status: 'paid' as const,
              payment_date: payDate,
              payment_status_2: 'paid' as const,
              payment_date_2: payDate,
            }
    await admin.from('billing_cycles').update(halfUpdate).eq('id', inv.billing_cycle_id)

    // Si se pagó la primera quincena: generar reactivamente la segunda SOLO si el cliente
    // tiene auto_billing activado. De lo contrario, el admin la creará manualmente.
    if (inv.biweekly_half === 'first') {
      const { data: clientFlags } = await admin
        .from('clients')
        .select('auto_billing')
        .eq('id', inv.client_id as string)
        .single()
      if (clientFlags?.auto_billing) {
        generatedSecondInvoiceId = await generateBiweeklySecondIfNeeded(admin, {
          cycleId: inv.billing_cycle_id as string,
          clientId: inv.client_id as string,
        })
      }
    }
  }

  return {
    ok: true,
    clientId: inv.client_id as string,
    cycleId: (inv.billing_cycle_id as string) ?? null,
    biweeklyHalf: (inv.biweekly_half as 'first' | 'second' | null) ?? null,
    generatedSecondInvoiceId,
  }
}

/**
 * Si la factura biweekly first se pagó y no existe la 'second' aún, la genera.
 * Devuelve el id de la nueva factura, o null si ya existía o falló.
 */
export async function generateBiweeklySecondIfNeeded(
  admin: SupabaseClient,
  args: { cycleId: string; clientId: string },
): Promise<string | null> {
  const { data: existingSecond } = await admin
    .from('invoices')
    .select('id')
    .eq('billing_cycle_id', args.cycleId)
    .eq('biweekly_half', 'second')
    .neq('status', 'void')
    .maybeSingle()
  if (existingSecond) return null

  const [{ data: cycle }, { data: client }, { data: emitter }] = await Promise.all([
    admin
      .from('billing_cycles')
      .select('id, period_start, period_end, plan_id_snapshot')
      .eq('id', args.cycleId)
      .single(),
    admin.from('clients').select('*').eq('id', args.clientId).single(),
    admin.from('company_settings').select('*').limit(1).maybeSingle(),
  ])
  if (!cycle || !client || !emitter) return null

  const { data: plan } = await admin
    .from('plans')
    .select('*')
    .eq('id', (cycle as BillingCycle).plan_id_snapshot)
    .single()
  if (!plan) return null

  // Periodo de la 2da quincena: medio del ciclo → period_end
  const start = new Date((cycle as BillingCycle).period_start)
  const secondHalfStart = new Date(start)
  secondHalfStart.setDate(start.getDate() + 7)
  const secondStartISO = secondHalfStart.toISOString().split('T')[0]
  const secondEndISO = (cycle as BillingCycle).period_end

  const label = invoicePeriodLabel(secondStartISO, secondEndISO, 'biweekly', 'second')
  const items = suggestItemsFromPlan(plan as Plan, label, 'second')
  const taxRate = (client as Client).default_tax_rate ?? 0
  const retentionRate = (client as Client).aplica_renta_retenida ? 0.1 : 0
  const totals = calculateTotals({ items, tax_rate: taxRate, discount_amount: 0, retention_rate: retentionRate })

  const { data: numberRow, error: numberErr } = await admin.rpc('next_invoice_number')
  if (numberErr || !numberRow) return null

  const { data: inserted, error: insertErr } = await admin
    .from('invoices')
    .insert({
      invoice_number: numberRow as unknown as string,
      client_id: (client as Client).id,
      billing_cycle_id: args.cycleId,
      quote_id: null,
      issue_date: todayString(),
      currency: 'USD',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: taxRate,
      tax_amount: totals.tax_amount,
      retention_rate: totals.retention_rate,
      retencion_renta_amount: totals.retencion_renta_amount,
      total: totals.total,
      total_a_pagar: totals.total_a_pagar,
      status: 'issued',
      client_snapshot_json: buildClientSnapshot(client as Client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter as CompanySettings),
      created_by: null,
      biweekly_half: 'second',
    })
    .select('id')
    .single()
  if (insertErr || !inserted) return null

  await admin.from('invoice_items').insert(
    totals.items.map((it) => ({
      invoice_id: inserted.id,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: it.line_total,
      sort_order: it.sort_order,
    })),
  )
  return inserted.id as string
}
