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
import {
  buildClientSnapshot,
  buildEmitterSnapshot,
  calculateTotals,
  suggestItemsFromPlan,
} from '@/lib/domain/invoices'
import { invoicePeriodLabel } from '@/lib/domain/billing'
import { nextCycleDates } from '@/lib/domain/cycles'
import { today as todayString } from '@/lib/domain/dates'
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

// ── Renovar mi plan (crea ciclo siguiente + factura + payment link) ──

/**
 * El cliente solicita renovar su plan al siguiente período.
 * Crea (o reutiliza) un billing_cycle scheduled, una factura issued y un
 * payment link dinámico. Devuelve la URL para abrir el modal de pago.
 */
export async function selfRenewMyCycle(): Promise<ActionResult> {
  const auth = await requireClientUser()
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const loaded = await loadClientWithPlan(admin, auth.clientId)
  if (!loaded.ok) return { error: loaded.error }
  const { client, plan } = loaded
  if (!plan) return { error: 'No tienes un plan asignado. Contacta a tu agencia.' }

  const emitter = await loadEmitter()
  if (!emitter) return { error: 'Configuración del emisor no inicializada' }

  // Obtener ciclo actual para calcular fechas del siguiente.
  const { data: currentRow } = await admin
    .from('billing_cycles')
    .select('id, period_start, period_end')
    .eq('client_id', client.id)
    .eq('status', 'current')
    .maybeSingle()
  const current = currentRow as Pick<BillingCycle, 'id' | 'period_start' | 'period_end'> | null
  if (!current) return { error: 'No tienes un ciclo activo. Contacta a tu agencia.' }

  // Crear o reutilizar scheduled.
  const { data: existingScheduled } = await admin
    .from('billing_cycles')
    .select('id, period_start, period_end')
    .eq('client_id', client.id)
    .eq('status', 'scheduled')
    .maybeSingle()

  let cycleId: string
  let periodStart: string
  let periodEnd: string

  if (existingScheduled) {
    cycleId = existingScheduled.id as string
    periodStart = existingScheduled.period_start as string
    periodEnd = existingScheduled.period_end as string
  } else {
    const dates = nextCycleDates(current.period_end, { billingPeriod: client.billing_period })
    periodStart = dates.periodStart
    periodEnd = dates.periodEnd
    const snapshot = plan.unified_content_limit != null
      ? { ...(plan.limits_json ?? {}), unified_content_limit: plan.unified_content_limit }
      : plan.limits_json
    const { data: newCycle, error: cycleErr } = await admin
      .from('billing_cycles')
      .insert({
        client_id: client.id,
        plan_id_snapshot: plan.id,
        limits_snapshot_json: snapshot,
        rollover_from_previous_json: null,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'scheduled',
        payment_status: 'unpaid',
      })
      .select('id')
      .single()
    if (cycleErr || !newCycle) return { error: 'Error al crear el ciclo programado' }
    cycleId = newCycle.id as string
  }

  // ¿Ya hay factura issued para ese ciclo? La reutilizamos en vez de crear duplicada.
  const { data: existingInvoice } = await admin
    .from('invoices')
    .select('id, n1co_payment_link_url, status')
    .eq('billing_cycle_id', cycleId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingInvoice && existingInvoice.n1co_payment_link_url && existingInvoice.status !== 'paid') {
    return {
      ok: true,
      paymentLinkUrl: existingInvoice.n1co_payment_link_url as string,
      invoiceId: existingInvoice.id as string,
    }
  }

  // Crear factura nueva con payment link n1co.
  const half: 'first' | null = client.billing_period === 'biweekly' ? 'first' : null
  const periodLabel = invoicePeriodLabel(periodStart, periodEnd, client.billing_period, half)
  const items = suggestItemsFromPlan(plan, periodLabel)
  const totals = calculateTotals({
    items,
    tax_rate: client.default_tax_rate ?? 0.13,
    discount_amount: 0,
  })

  const { data: numberRow, error: numberErr } = await admin.rpc('next_invoice_number')
  if (numberErr || !numberRow) return { error: 'Error al generar correlativo' }

  const { data: inserted, error: insertErr } = await admin
    .from('invoices')
    .insert({
      invoice_number: numberRow as unknown as string,
      client_id: client.id,
      billing_cycle_id: cycleId,
      issue_date: todayString(),
      currency: 'USD',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: client.default_tax_rate ?? 0.13,
      tax_amount: totals.tax_amount,
      total: totals.total,
      status: 'issued',
      client_snapshot_json: buildClientSnapshot(client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter),
      created_by: null,
      biweekly_half: half,
      payment_provider: 'n1co_link',
    })
    .select('id, invoice_number, total, currency, billing_cycle_id')
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
        total: inserted.total as number,
        currency: inserted.currency as string,
        billing_cycle_id: inserted.billing_cycle_id as string | null,
      },
      client: { id: client.id, name: client.name },
      plan: { id: plan.id, name: plan.name },
      periodLabel,
      locationCode: emitter.n1co_location_code ?? undefined,
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
    if (err instanceof N1coApiError) {
      console.error('[selfRenew] n1co api error', err.status, err.body)
    } else {
      console.error('[selfRenew] error creando link', err)
    }
    // Mantener factura sin link — admin puede regenerar
    return { error: 'No se pudo conectar con la pasarela. Intenta de nuevo en un momento.' }
  }

  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/facturacion')
  return { ok: true, paymentLinkUrl, invoiceId: inserted.id as string }
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
  const totals = calculateTotals({
    items,
    tax_rate: client.default_tax_rate ?? 0.13,
    discount_amount: 0,
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
      total: totals.total,
      status: 'issued',
      notes: `Paquete extra solicitado por el cliente desde el portal · Plan ${plan?.name ?? '—'}`,
      client_snapshot_json: buildClientSnapshot(client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter),
      payment_provider: 'n1co_link_oneoff',
    })
    .select('id, invoice_number, total, currency, billing_cycle_id')
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
        total: inserted.total as number,
        currency: inserted.currency as string,
        billing_cycle_id: inserted.billing_cycle_id as string | null,
      },
      client: { id: client.id, name: client.name },
      plan: plan ? { id: plan.id, name: `${plan.name} · cambios extras` } : null,
      locationCode: emitter.n1co_location_code ?? undefined,
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
  const totals = calculateTotals({
    items,
    tax_rate: client.default_tax_rate ?? 0.13,
    discount_amount: 0,
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
      total: totals.total,
      status: 'issued',
      notes: `Contenido extra solicitado por el cliente desde el portal · Plan ${plan?.name ?? '—'}`,
      client_snapshot_json: buildClientSnapshot(client),
      emitter_snapshot_json: buildEmitterSnapshot(emitter),
      payment_provider: 'n1co_link_oneoff',
    })
    .select('id, invoice_number, total, currency, billing_cycle_id')
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
        total: inserted.total as number,
        currency: inserted.currency as string,
        billing_cycle_id: inserted.billing_cycle_id as string | null,
      },
      client: { id: client.id, name: client.name },
      plan: plan ? { id: plan.id, name: `${label} adicional` } : null,
      locationCode: emitter.n1co_location_code ?? undefined,
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
