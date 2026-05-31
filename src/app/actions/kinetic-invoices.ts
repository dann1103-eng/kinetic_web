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
  ServiceType,
  Invoice,
} from '@/types/db'
import { SERVICE_TYPE_LABELS } from '@/types/db'

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
      const sessions = t.sessions_per_month ?? 1
      return {
        description: `${serviceLabel} — ${sessions} sesión${sessions !== 1 ? 'es' : ''}/mes`,
        quantity: 1,
        unit_price: sessions * (t.unit_cost_usd ?? 0),
      }
    })
}

/**
 * Genera el período como label legible (ej. "abril 2026").
 * `periodMonth` viene como 'YYYY-MM-01'.
 */
function periodLabel(periodMonth: string): string {
  return new Date(`${periodMonth.slice(0, 10)}T00:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

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

  // Ítems desde snapshot del plan
  const snapshot = cycle.treatment_plan_snapshot as TreatmentPlan | Record<string, unknown>
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

  const totals = calculateTotals({
    items,
    tax_rate: 0,            // Kinetic no aplica IVA por defecto
    discount_amount: discountAmount,
    retention_rate: 0,
  })

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
      due_date: null,
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

  revalidatePath('/familias', 'layout')
  revalidatePath('/billing/invoices')

  return { ok: true, data: fullInvoice as Invoice }
}
