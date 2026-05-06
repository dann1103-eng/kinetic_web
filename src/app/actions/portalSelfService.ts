'use server'

/**
 * Server actions de auto-servicio para el portal del cliente.
 *
 * Permite al cliente:
 *   - Renovar su plan (crear factura del siguiente ciclo + payment link)
 *   - Comprar paquetes de cambios extras
 *   - Comprar contenido extra (video, reel, etc.)
 *
 * Todas las acciones validan que el user autenticado sea client_user del cliente
 * activo (vía getActiveClientId() que ya hace ese check), y devuelven la URL del
 * payment link de n1co para que el frontend abra el modal embebido.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveClientId } from '@/lib/supabase/active-client'
import { assertNotImpersonating } from './impersonation'
import {
  buildClientSnapshot,
  buildEmitterSnapshot,
  calculateTotals,
  suggestItemsFromPlan,
} from '@/lib/domain/invoices'
import { invoicePeriodLabel } from '@/lib/domain/billing'
import { nextCycleDates } from '@/lib/domain/cycles'
import { today as todayString } from '@/lib/domain/dates'
import { movePhase } from '@/lib/domain/pipeline'
import { CONTENT_TYPE_LABELS, EXTRA_CONTENT_PRICES } from '@/lib/domain/plans'
import { createInvoicePaymentLink, createPackagePaymentLink, extractPaymentLinkId } from '@/lib/n1co/payment-links'
import { N1coApiError } from '@/lib/n1co/types'
import type {
  BillingCycle,
  Client,
  CompanySettings,
  ContentType,
  Plan,
} from '@/types/db'

type ActionError = { error: string }
type ActionOk = { ok: true; paymentLinkUrl: string; invoiceId: string }
type ActionResult = ActionError | ActionOk

async function requireClientUser(): Promise<{ clientId: string } | ActionError> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const clientId = await getActiveClientId()
  if (!clientId) return { error: 'Sin cliente activo' }
  return { clientId }
}

async function loadEmitter(): Promise<CompanySettings | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('company_settings').select('*').limit(1).maybeSingle()
  return data as CompanySettings | null
}

type LoadResult =
  | { ok: false; error: string }
  | { ok: true; client: Client; plan: Plan | null }

async function loadClientWithPlan(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<LoadResult> {
  const { data: clientRow } = await admin.from('clients').select('*').eq('id', clientId).single()
  const client = clientRow as Client | null
  if (!client) return { ok: false, error: 'Cliente no encontrado' }
  const { data: planRow } = client.current_plan_id
    ? await admin.from('plans').select('*').eq('id', client.current_plan_id).maybeSingle()
    : { data: null }
  const plan = planRow as Plan | null
  return { ok: true, client, plan }
}

// ── Comprar paquete de cambios extras ──

/**
 * El cliente compra un paquete de cambios extras estándar.
 * Crea una factura one-off (sin ligar a ciclo), genera payment link.
 * Cuando se pague, el webhook actualizará el ciclo (TODO en webhook router).
 */
export async function purchaseExtraCambios(args: {
  qty: number
  pricePerPackage: number
}): Promise<ActionResult> {
  const auth = await requireClientUser()
  if ('error' in auth) return auth
  if (args.qty <= 0 || args.pricePerPackage <= 0) {
    return { error: 'Datos del paquete inválidos' }
  }

  const admin = createAdminClient()
  const loaded = await loadClientWithPlan(admin, auth.clientId)
  if (!loaded.ok) return { error: loaded.error }
  const { client, plan } = loaded

  const emitter = await loadEmitter()
  if (!emitter) return { error: 'Configuración del emisor no inicializada' }

  // Ciclo actual para metadata
  const { data: currentRow } = await admin
    .from('billing_cycles')
    .select('id')
    .eq('client_id', client.id)
    .eq('status', 'current')
    .maybeSingle()
  const cycleId = currentRow?.id as string | undefined

  const description = `Paquete de ${args.qty} cambios adicionales`
  const items = [{ description, quantity: 1, unit_price: args.pricePerPackage }]
  const retentionRate = client.aplica_renta_retenida ? 0.1 : 0
  const totals = calculateTotals({
    items,
    tax_rate: client.default_tax_rate ?? 0.13,
    discount_amount: 0,
    retention_rate: retentionRate,
  })

  const { data: numberRow, error: numberErr } = await admin.rpc('next_invoice_number')
  if (numberErr || !numberRow) return { error: 'Error al generar correlativo' }

  const { data: inserted, error: insertErr } = await admin
    .from('invoices')
    .insert({
      invoice_number: numberRow as unknown as string,
      client_id: client.id,
      billing_cycle_id: cycleId ?? null,
      issue_date: todayString(),
      currency: 'USD',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: client.default_tax_rate ?? 0.13,
      tax_amount: totals.tax_amount,
      retention_rate: totals.retention_rate,
      retencion_renta_amount: totals.retencion_renta_amount,
      total: totals.total,
      total_a_pagar: totals.total_a_pagar,
      status: 'issued',
      notes: `Paquete extra solicitado por el cliente desde el portal · Plan ${plan?.name ?? '—'}`,
      client_snapshot_json: buildClientSnapshot(client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter),
      payment_provider: 'n1co_link_oneoff',
      extras_metadata: { kind: 'cambios', qty: args.qty },
    })
    .select('id, invoice_number, total, total_a_pagar, currency, billing_cycle_id')
    .single()
  if (insertErr || !inserted) return { error: 'Error al crear la factura' }

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

  let paymentLinkUrl = ''
  try {
    // Usamos createInvoicePaymentLink (no createPackagePaymentLink) para mantener
    // el matching simple por orderReference=invoice.id en el webhook.
    void createPackagePaymentLink // mark as used (referenced en otros flujos)
    const link = await createInvoicePaymentLink({
      invoice: {
        id: inserted.id as string,
        invoice_number: inserted.invoice_number as string,
        currency: inserted.currency as string,
        billing_cycle_id: inserted.billing_cycle_id as string | null,
      },
      amount: (inserted.total_a_pagar ?? inserted.total) as number,
      client: { id: client.id, name: client.name },
      plan: plan ? { id: plan.id, name: `${plan.name} · cambios extras` } : null,
      locationCode: emitter.n1co_location_code ?? undefined,
      extraMetadata: [
        { name: 'extraKind', value: 'cambios' },
        { name: 'extraQty', value: String(args.qty) },
        { name: 'extraPrice', value: String(args.pricePerPackage) },
      ],
    })
    paymentLinkUrl = link.paymentLinkUrl
    await admin
      .from('invoices')
      .update({
        n1co_payment_link_url: link.paymentLinkUrl,
        n1co_payment_link_id: extractPaymentLinkId(link.paymentLinkUrl) ?? String(link.orderId),
        n1co_order_reference: inserted.id as string,
      })
      .eq('id', inserted.id)
  } catch (err) {
    console.error('[purchaseExtraCambios] error creando link', err)
    return { error: 'No se pudo conectar con la pasarela. Intenta de nuevo.' }
  }

  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/facturacion')
  return { ok: true, paymentLinkUrl, invoiceId: inserted.id as string }
}

// ── Comprar contenido extra (estatico, video corto, reel, short) ──

export async function purchaseExtraContent(args: {
  contentType: ContentType
  qty: number
}): Promise<ActionResult> {
  const auth = await requireClientUser()
  if ('error' in auth) return auth
  if (args.qty <= 0) return { error: 'Cantidad inválida' }

  const unitPrice = EXTRA_CONTENT_PRICES[args.contentType]
  if (!unitPrice) return { error: 'Este tipo de contenido no se vende como extra' }

  const admin = createAdminClient()
  const loaded = await loadClientWithPlan(admin, auth.clientId)
  if (!loaded.ok) return { error: loaded.error }
  const { client, plan } = loaded

  const emitter = await loadEmitter()
  if (!emitter) return { error: 'Configuración del emisor no inicializada' }

  const { data: currentRow } = await admin
    .from('billing_cycles')
    .select('id')
    .eq('client_id', client.id)
    .eq('status', 'current')
    .maybeSingle()
  const cycleId = currentRow?.id as string | undefined

  const label = CONTENT_TYPE_LABELS[args.contentType]
  const description = `${label} adicional${args.qty > 1 ? ` (×${args.qty})` : ''}`
  const items = [{ description, quantity: args.qty, unit_price: unitPrice }]
  const retentionRate = client.aplica_renta_retenida ? 0.1 : 0
  const totals = calculateTotals({
    items,
    tax_rate: client.default_tax_rate ?? 0.13,
    discount_amount: 0,
    retention_rate: retentionRate,
  })

  const { data: numberRow, error: numberErr } = await admin.rpc('next_invoice_number')
  if (numberErr || !numberRow) return { error: 'Error al generar correlativo' }

  const { data: inserted, error: insertErr } = await admin
    .from('invoices')
    .insert({
      invoice_number: numberRow as unknown as string,
      client_id: client.id,
      billing_cycle_id: cycleId ?? null,
      issue_date: todayString(),
      currency: 'USD',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: client.default_tax_rate ?? 0.13,
      tax_amount: totals.tax_amount,
      retention_rate: totals.retention_rate,
      retencion_renta_amount: totals.retencion_renta_amount,
      total: totals.total,
      total_a_pagar: totals.total_a_pagar,
      status: 'issued',
      notes: `Contenido extra solicitado por el cliente desde el portal · Plan ${plan?.name ?? '—'}`,
      client_snapshot_json: buildClientSnapshot(client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter),
      payment_provider: 'n1co_link_oneoff',
      extras_metadata: { kind: 'content', content_type: args.contentType, qty: args.qty },
    })
    .select('id, invoice_number, total, total_a_pagar, currency, billing_cycle_id')
    .single()
  if (insertErr || !inserted) return { error: 'Error al crear la factura' }

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

  let paymentLinkUrl = ''
  try {
    const link = await createInvoicePaymentLink({
      invoice: {
        id: inserted.id as string,
        invoice_number: inserted.invoice_number as string,
        currency: inserted.currency as string,
        billing_cycle_id: inserted.billing_cycle_id as string | null,
      },
      amount: (inserted.total_a_pagar ?? inserted.total) as number,
      client: { id: client.id, name: client.name },
      plan: plan ? { id: plan.id, name: `${label} adicional` } : null,
      locationCode: emitter.n1co_location_code ?? undefined,
      extraMetadata: [
        { name: 'extraKind', value: 'content' },
        { name: 'extraContentType', value: args.contentType },
        { name: 'extraQty', value: String(args.qty) },
        { name: 'extraPrice', value: String(unitPrice) },
      ],
    })
    paymentLinkUrl = link.paymentLinkUrl
    await admin
      .from('invoices')
      .update({
        n1co_payment_link_url: link.paymentLinkUrl,
        n1co_payment_link_id: extractPaymentLinkId(link.paymentLinkUrl) ?? String(link.orderId),
        n1co_order_reference: inserted.id as string,
      })
      .eq('id', inserted.id)
  } catch (err) {
    console.error('[purchaseExtraContent] error creando link', err)
    return { error: 'No se pudo conectar con la pasarela. Intenta de nuevo.' }
  }

  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/facturacion')
  return { ok: true, paymentLinkUrl, invoiceId: inserted.id as string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente aprueba requerimiento desde revisión → mueve a fase 'aprobado'
// ─────────────────────────────────────────────────────────────────────────────

export async function clientApproveRequirement(
  requirementId: string
): Promise<{ ok: true } | { error: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // Cargar el requerimiento y verificar que esté en revision_cliente
  const { data: req } = await admin
    .from('requirements')
    .select('id, phase, content_type, billing_cycle_id')
    .eq('id', requirementId)
    .maybeSingle()

  if (!req) return { error: 'Requerimiento no encontrado.' }
  if (req.phase !== 'revision_cliente') {
    return { error: 'Solo puedes aprobar requerimientos en revisión.' }
  }

  // Verificar que el usuario sea client_user del cliente dueño del ciclo
  const { data: cycle } = await admin
    .from('billing_cycles')
    .select('client_id')
    .eq('id', req.billing_cycle_id)
    .maybeSingle()

  if (!cycle) return { error: 'Ciclo no encontrado.' }

  const { data: membership } = await supabase
    .from('client_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_id', cycle.client_id)
    .maybeSingle()

  if (!membership) return { error: 'No tienes acceso a este requerimiento.' }

  // Mover la fase usando admin client (clientes no tienen RLS de escritura en requirements)
  const result = await movePhase(admin, {
    requirementId,
    currentPhase: 'revision_cliente',
    contentType: req.content_type as ContentType,
    toPhase: 'aprobado',
    movedBy: user.id,
    notes: 'Aprobado por el cliente desde el portal',
  })

  if (result.error) return { error: result.error }

  revalidatePath('/portal/pipeline')
  revalidatePath('/portal/calendario')
  return { ok: true }
}
