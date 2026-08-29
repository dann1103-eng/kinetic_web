'use server'

/**
 * kinetic-invoices.ts
 *
 * Acciones para crear y gestionar facturas ligadas a ciclos mensuales de terapia.
 * Las facturas Kinetic usan child_id en lugar de client_id (que es para FM CRM).
 *
 * Patrón: el admin marca el pago del mes en NewMonthlyCycleModal →
 * confirmMonthlyPaymentAndGenerate (monthly-cycles.ts) crea el ciclo →
 * luego llama createInvoiceForCycle() para generar la factura automáticamente.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  buildFamilySnapshot,
  buildEmitterSnapshot,
  calculateTotals,
} from '@/lib/domain/invoices'
import { today as todayString } from '@/lib/domain/dates'
import type {
  CompanySettings,
  Family,
  MonthlySessionCycle,
  TreatmentPlan,
  TreatmentPlanTherapyEntry,
  ServiceCatalogItem,
  ServiceType,
  Invoice,
} from '@/types/db'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import { daysPerWeekLabel, isMonthlyFlatEntry } from '@/lib/domain/billing/monthly-flat'
import { withCatalogPrices } from '@/lib/domain/billing/catalog-price'
import { computeCarryIns, periodLabel } from '@/lib/domain/billing/carry-ins'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

/**
 * Construye los ítems de factura a partir del snapshot del plan de tratamiento.
 * Una línea por terapia activa: "Terapia Ocupacional — 4 sesiones" → subtotal.
 */
function buildCycleLineItems(
  snapshot: TreatmentPlan | Record<string, unknown>,
): { description: string; quantity: number; unit_price: number }[] {
  const therapies = (snapshot as { therapies_json?: TreatmentPlanTherapyEntry[] })
    .therapies_json ?? []

  return therapies
    .filter((t) => t.active !== false)
    .map((t) => {
      const serviceLabel =
        SERVICE_TYPE_LABELS[t.service as ServiceType] ??
        t.service.replace(/_/g, ' ')
      // Programas matutinos: mensualidad fija de suscripción — 1 × precio,
      // sin importar cuántos días trae el mes.
      if (isMonthlyFlatEntry(t)) {
        const variant = daysPerWeekLabel(t.days_per_week)
        return {
          description: `Mensualidad ${serviceLabel}${variant ? ` — ${variant}` : ''}`,
          quantity: 1,
          unit_price: t.unit_cost_usd ?? 0,
        }
      }
      const sessions = t.sessions_per_month ?? 1
      return {
        description: `${serviceLabel} — ${sessions} sesión${sessions !== 1 ? 'es' : ''}/mes`,
        quantity: 1,
        unit_price: sessions * (t.unit_cost_usd ?? 0),
      }
    })
}

// `periodLabel` vive junto a la regla de arrastres (carry-ins.ts), que es quien
// más lo usa: una sola definición para las descripciones de las líneas.

/**
 * Crea una factura para un ciclo mensual de terapia ya registrado.
 *
 * - Carga: ciclo + niño + familia + company_settings
 * - Calcula ítems desde el treatment_plan_snapshot del ciclo
 * - Aplica el descuento registrado en el ciclo
 * - Emite la factura como `issued` (el pago ya se registró en el ciclo)
 * - Linkea: monthly_session_cycles.invoice_id = nueva factura
 *
 * Puede llamarse desde confirmMonthlyPaymentAndGenerate (automático)
 * o manualmente si el ciclo quedó sin factura.
 */
export async function createInvoiceForCycle(
  cycleId: string,
): Promise<Result<Invoice>> {
  const { supabase, user } = await getActor()

  // Cargar ciclo
  const { data: cycleRaw } = await supabase
    .from('monthly_session_cycles')
    .select('*')
    .eq('id', cycleId)
    .maybeSingle()

  if (!cycleRaw) return { ok: false, error: 'Ciclo no encontrado.' }
  const cycle = cycleRaw as MonthlySessionCycle

  // Cargar niño + familia (siempre, tanto para crear como para parchar)
  const { data: childRaw } = await supabase
    .from('children')
    .select('id, full_name, family_id')
    .eq('id', cycle.child_id)
    .maybeSingle()

  if (!childRaw) return { ok: false, error: 'Niño no encontrado.' }
  const child = childRaw as { id: string; full_name: string; family_id: string }

  const { data: familyRaw } = await supabase
    .from('families')
    .select('*')
    .eq('id', child.family_id)
    .maybeSingle()

  if (!familyRaw) return { ok: false, error: 'Familia no encontrada.' }
  const family = familyRaw as Family

  // Cargar company_settings para emitter snapshot
  const admin = createAdminClient()
  const { data: settingsRaw } = await admin
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()
  const settings = settingsRaw as CompanySettings | null
  if (!settings) return { ok: false, error: 'No hay configuración de empresa. Completá los datos en Ajustes.' }

  // Ítems desde snapshot del plan. El snapshot copia el PLAN, y el plan ya no
  // guarda precios: si vienen en cero hay que traerlos del catálogo o la factura
  // sale en $0 (pasó durante meses, ver notas del proyecto).
  const rawSnapshot = cycle.treatment_plan_snapshot as TreatmentPlan | Record<string, unknown>
  const rawTherapies =
    (rawSnapshot as { therapies_json?: TreatmentPlanTherapyEntry[] }).therapies_json ?? []
  const { data: catalogRaw } = await admin.from('service_catalog').select('*')
  const priced = withCatalogPrices(rawTherapies, (catalogRaw ?? []) as ServiceCatalogItem[])
  if (priced.filled.length > 0) {
    console.warn(
      `[createInvoiceForCycle] ${cycleId}: precios tomados del catálogo para ${priced.filled.map((f) => f.service).join(', ')} (el snapshot los traía en cero).`,
    )
  }
  const snapshot = { ...rawSnapshot, therapies_json: priced.therapies }
  const items = buildCycleLineItems(snapshot)

  if (items.length === 0) {
    return {
      ok: false,
      error: 'El plan de tratamiento no tiene terapias activas. No se puede generar la factura.',
    }
  }

  // Calcular descuento absoluto para pasarlo a calculateTotals
  const subtotalRaw = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  let discountAmount = 0
  if (cycle.discount_kind === 'percent' && cycle.discount_value > 0) {
    discountAmount = Math.round(subtotalRaw * (cycle.discount_value / 100) * 100) / 100
  } else if (cycle.discount_kind === 'fixed' && cycle.discount_value > 0) {
    discountAmount = Math.min(cycle.discount_value, subtotalRaw)
  }
  // Rollover en modo 'discount': sumar el crédito por sesiones no dadas.
  const rolloverDiscount =
    cycle.rollover_mode === 'discount' ? Number(cycle.rollover_discount_usd ?? 0) : 0
  if (rolloverDiscount > 0) {
    discountAmount = Math.min(subtotalRaw, discountAmount + rolloverDiscount)
  }
  // Arrastres de meses anteriores: recargo por mora (mig 0175) y ajuste de plan
  // (migs 0177/0178). La REGLA vive en `computeCarryIns` — pura y con tests — para
  // que la previsualización del cobro pueda usar exactamente la misma sin escribir
  // nada. Acá quedan las lecturas y, después de facturar, el marcado de los ciclos
  // de origen (`persist*`), que es lo que evita cobrar dos veces lo mismo.
  const [{ data: pendingSurchargeRaw }, { data: pendingAdjRaw }] = await Promise.all([
    admin
      .from('monthly_session_cycles')
      .select('id, period_month, surcharge_amount_usd')
      .eq('child_id', cycle.child_id)
      .neq('status', 'cancelled')
      .eq('payment_status', 'paid')
      .gt('surcharge_amount_usd', 0)
      .is('surcharge_carried_at', null)
      .lt('period_month', cycle.period_month)
      .order('period_month'),
    admin
      .from('monthly_session_cycles')
      .select('id, period_month, billing_adjustment_usd')
      .eq('child_id', cycle.child_id)
      .neq('status', 'cancelled')
      .eq('payment_status', 'paid')
      .neq('billing_adjustment_usd', 0)
      .is('billing_adjustment_carried_at', null)
      .lt('period_month', cycle.period_month)
      .order('period_month'),
  ])

  const carry = computeCarryIns({
    cycle: {
      period_month: String(cycle.period_month),
      surcharge_carried_in_usd: cycle.surcharge_carried_in_usd,
      billing_adjustment_carried_in_usd: cycle.billing_adjustment_carried_in_usd,
    },
    familyLateFeeExempt: !!(family as { late_fee_exempt?: boolean }).late_fee_exempt,
    pendingSurchargeCycles: (pendingSurchargeRaw ?? []) as {
      id: string
      period_month: string
      surcharge_amount_usd: number
    }[],
    pendingAdjustmentCycles: (pendingAdjRaw ?? []) as {
      id: string
      period_month: string
      billing_adjustment_usd: number
    }[],
  })

  // Las líneas de arrastre se agregan DESPUÉS del descuento a propósito: el
  // porcentaje no debe reducir un recargo ni un ajuste que vienen de otro mes.
  for (const line of carry.lines) {
    items.push({ description: line.description, quantity: 1, unit_price: line.amount })
  }

  /** Marca los ciclos de origen del recargo tras crear/parchar la factura. */
  async function persistCarriedSurcharge() {
    if (carry.surchargeFromCycleIds.length === 0) return
    await admin
      .from('monthly_session_cycles')
      .update({ surcharge_carried_in_usd: carry.surchargeTotal })
      .eq('id', cycleId)
    await admin
      .from('monthly_session_cycles')
      .update({ surcharge_carried_at: new Date().toISOString() })
      .in('id', carry.surchargeFromCycleIds)
  }

  /** Marca los ciclos de origen del ajuste tras crear/parchar la factura. */
  async function persistCarriedAdjustment() {
    if (carry.adjustmentFromCycleIds.length === 0) return
    await admin
      .from('monthly_session_cycles')
      .update({ billing_adjustment_carried_in_usd: carry.adjustmentTotal })
      .eq('id', cycleId)
    await admin
      .from('monthly_session_cycles')
      .update({ billing_adjustment_carried_at: new Date().toISOString() })
      .in('id', carry.adjustmentFromCycleIds)
  }

  const totals = calculateTotals({
    items,
    tax_rate: 0,            // Kinetic no aplica IVA por defecto
    discount_amount: discountAmount,
    retention_rate: 0,
  })

  // GUARD: una factura en $0 es legítima (beca completa, pago anual prepagado) y
  // en esos casos el ciclo también cobra $0. Pero si el ciclo cobra algo y las
  // líneas dan cero, es el snapshot sin precios: mejor fallar visible que emitir
  // un documento en cero. Se emitieron 30+ así antes de detectarlo.
  if (totals.total === 0 && Number(cycle.payment_amount_usd ?? 0) > 0) {
    const faltantes = priced.stillUnpriced.length > 0 ? priced.stillUnpriced.join(', ') : 'las terapias del ciclo'
    return {
      ok: false,
      error: `La factura saldría en $0.00 pero el ciclo cobra $${Number(cycle.payment_amount_usd).toFixed(2)}. Falta el precio de ${faltantes} en Catálogos, o los precios del ciclo quedaron en cero. Corregilo antes de facturar.`,
    }
  }

  const period = periodLabel(cycle.period_month)
  const notes = cycle.discount_reason
    ? `Ciclo: ${period} — ${child.full_name}. Descuento: ${cycle.discount_reason}`
    : `Ciclo: ${period} — ${child.full_name}`

  if (cycle.invoice_id) {
    // La factura fue creada por el RPC antes de que pudiéramos enriquecerla.
    // La parchamos: snapshot fiscal, descuentos correctos, ítems con labels legibles.
    const existingId = cycle.invoice_id

    await admin
      .from('invoices')
      .update({
        child_id: cycle.child_id,
        subtotal: totals.subtotal,
        discount_amount: totals.discount_amount,
        total: totals.total,
        total_a_pagar: totals.total_a_pagar,
        notes,
        client_snapshot_json: buildFamilySnapshot(family),
        emitter_snapshot_json: buildEmitterSnapshot(settings),
        payment_method: (cycle.payment_method ?? 'cash') as import('@/types/db').InvoicePaymentMethod,
      })
      .eq('id', existingId)

    // Re-crear ítems con descripciones en español y totales correctos
    await admin.from('invoice_items').delete().eq('invoice_id', existingId)
    await admin.from('invoice_items').insert(
      items.map((item, idx) => ({
        invoice_id: existingId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price,
        sort_order: idx,
      }))
    )

    const { data: patched } = await admin
      .from('invoices')
      .select('*')
      .eq('id', existingId)
      .single()

    await persistCarriedSurcharge()
    await persistCarriedAdjustment()

    revalidatePath('/familias', 'layout')
    revalidatePath('/billing/invoices')

    return { ok: true, data: patched as Invoice }
  }

  // Número de factura (RPC compartido con FM)
  const { data: numberRow, error: numberErr } = await admin.rpc('next_invoice_number')
  if (numberErr || !numberRow) return { ok: false, error: 'Error al generar el correlativo de factura.' }
  const invoiceNumber = numberRow as unknown as string

  // Insertar factura nueva
  const { data: inserted, error: insertErr } = await admin
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      client_id: null,
      child_id: cycle.child_id,
      issue_date: cycle.paid_at ? cycle.paid_at.slice(0, 10) : todayString(),
      // Ciclos desacoplados (agenda primero, factura después): heredar la fecha
      // límite de pago del ciclo para que el recargo por mora corra igual.
      due_date: cycle.due_date ?? null,
      currency: 'USD',
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: 0,
      tax_amount: 0,
      retention_rate: 0,
      retencion_renta_amount: 0,
      total: totals.total,
      total_a_pagar: totals.total_a_pagar,
      status: 'issued' as const,
      payment_date: cycle.paid_at ? cycle.paid_at.slice(0, 10) : null,
      payment_method: (cycle.payment_method ?? 'cash') as import('@/types/db').InvoicePaymentMethod,
      payment_reference: cycle.payment_reference ?? null,
      notes,
      client_snapshot_json: buildFamilySnapshot(family),
      emitter_snapshot_json: buildEmitterSnapshot(settings),
      created_by: user.id,
      payment_provider: 'manual' as const,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? 'Error al crear la factura.' }
  }

  const invoiceId = (inserted as { id: string }).id

  // Insertar ítems
  await admin.from('invoice_items').insert(
    items.map((item, idx) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.quantity * item.unit_price,
      sort_order: idx,
    }))
  )

  // Linkear ciclo → factura
  await admin
    .from('monthly_session_cycles')
    .update({ invoice_id: invoiceId })
    .eq('id', cycleId)

  // Cargar la factura completa para devolver
  const { data: fullInvoice } = await admin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  await persistCarriedSurcharge()
  await persistCarriedAdjustment()

  revalidatePath('/familias', 'layout')
  revalidatePath('/billing/invoices')

  return { ok: true, data: fullInvoice as Invoice }
}
