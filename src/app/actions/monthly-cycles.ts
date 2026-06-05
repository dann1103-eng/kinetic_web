'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  MonthlyCandidateAppointment,
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  DiscountKind,
} from '@/types/db'
import { validateDiscount } from '@/lib/domain/discounts'
import { createInvoiceForCycle } from './kinetic-invoices'
import { fromZonedTime } from 'date-fns-tz'

const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
  'contable',
] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isMgmt(role: string): boolean {
  return (MGMT_ROLES as readonly string[]).includes(role)
}

/** 'YYYY-MM' o '2026-04-01' → '2026-04-01' (string). */
function normalizePeriodMonth(input: string): string {
  if (/^\d{4}-\d{2}$/.test(input)) return `${input}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input.slice(0, 8) + '01'
  throw new Error('Período inválido (esperado YYYY-MM).')
}

// ── Lookups ────────────────────────────────────────────────────────────────

export async function listMonthlyCyclesByChild(
  childId: string,
): Promise<MonthlySessionCycle[]> {
  const { supabase } = await getActor()
  const { data, error } = await supabase
    .from('monthly_session_cycles')
    .select('*')
    .eq('child_id', childId)
    .order('period_month', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as MonthlySessionCycle[]
}

// ── Dry run (cualquier staff puede previsualizar) ──────────────────────────

export async function dryRunMonthlyGeneration(
  childId: string,
  periodMonthInput: string,
  rolloverSessions?: Record<string, number> | null,
): Promise<{ ok: true; result: MonthlyCandidatesResult } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  let periodMonth: string
  try {
    periodMonth = normalizePeriodMonth(periodMonthInput)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Período inválido.' }
  }

  const { data, error } = await supabase.rpc('compute_monthly_appointment_candidates', {
    p_child_id: childId,
    p_period_month: periodMonth,
    p_rollover_sessions:
      rolloverSessions && Object.keys(rolloverSessions).length > 0 ? rolloverSessions : null,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('no_active_treatment_plan')) {
      return { ok: false, error: 'El niño no tiene plan de tratamiento activo.' }
    }
    if (msg.includes('plan_has_no_primary_therapist')) {
      return { ok: false, error: 'El plan no tiene terapista principal asignada.' }
    }
    // Surface real para diagnóstico (ej. función desactualizada / columna faltante).
    return { ok: false, error: `Error al calcular el ciclo: ${msg || 'desconocido'}` }
  }

  return { ok: true, result: data as MonthlyCandidatesResult }
}

// ── Rollover: sesiones no dadas del mes anterior ───────────────────────────

export interface RolloverPreviewItem {
  service: string
  missed: number
  unitPrice: number
  amount: number
}

export interface RolloverPreview {
  fromPeriod: string // 'YYYY-MM-01' del mes anterior con ciclo
  items: RolloverPreviewItem[]
  totalDiscount: number
}

/**
 * Calcula, para el mes ANTERIOR al período dado, las sesiones de terapia que
 * NO se dieron (no_show/late_cancel/cancelled) y NO fueron repuestas.
 * Devuelve por servicio: cuántas y el monto (× precio del ciclo anterior).
 */
export async function getCycleRolloverPreview(
  childId: string,
  periodMonthInput: string,
): Promise<{ ok: true; preview: RolloverPreview | null } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  let periodMonth: string
  try {
    periodMonth = normalizePeriodMonth(periodMonthInput)
  } catch {
    return { ok: false, error: 'Período inválido.' }
  }

  // Mes anterior.
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const prevPeriod = `${prevY}-${String(prevM).padStart(2, '0')}-01`
  const startISO = fromZonedTime(new Date(prevY, prevM - 1, 1, 0, 0, 0), 'America/El_Salvador').toISOString()
  const endISO = fromZonedTime(new Date(prevY, prevM, 1, 0, 0, 0), 'America/El_Salvador').toISOString()

  // Citas de terapia del mes anterior.
  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('id, service_type, status')
    .eq('child_id', childId)
    .eq('event_type', 'terapia')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const appts = (apptsRaw ?? []) as { id: string; service_type: string | null; status: string }[]
  if (appts.length === 0) return { ok: true, preview: null }

  // Ausencias repuestas de esas citas.
  const apptIds = appts.map((a) => a.id)
  const { data: absRaw } = await supabase
    .from('appointment_absences')
    .select('appointment_id, status')
    .in('appointment_id', apptIds)
  const replaced = new Set(
    (absRaw ?? [])
      .filter((a) => a.status === 'replaced')
      .map((a) => a.appointment_id as string),
  )

  // No dadas sin reposición, por servicio.
  const missedBy = new Map<string, number>()
  for (const a of appts) {
    const notDelivered = ['no_show', 'late_cancel', 'cancelled'].includes(a.status)
    if (notDelivered && !replaced.has(a.id)) {
      const svc = a.service_type ?? 'otra'
      missedBy.set(svc, (missedBy.get(svc) ?? 0) + 1)
    }
  }
  if (missedBy.size === 0) return { ok: true, preview: { fromPeriod: prevPeriod, items: [], totalDiscount: 0 } }

  // Precio por servicio: del snapshot del ciclo anterior (lo que pagaron).
  const { data: prevCycle } = await supabase
    .from('monthly_session_cycles')
    .select('treatment_plan_snapshot')
    .eq('child_id', childId)
    .eq('period_month', prevPeriod)
    .neq('status', 'cancelled')
    .maybeSingle()
  const priceBy = new Map<string, number>()
  const snap = (prevCycle?.treatment_plan_snapshot ?? {}) as {
    therapies_json?: { service: string; unit_cost_usd?: number }[]
  }
  for (const t of snap.therapies_json ?? []) {
    priceBy.set(t.service, Number(t.unit_cost_usd ?? 0))
  }

  const items: RolloverPreviewItem[] = Array.from(missedBy.entries()).map(([service, missed]) => {
    const unitPrice = priceBy.get(service) ?? 0
    return { service, missed, unitPrice, amount: Math.round(missed * unitPrice * 100) / 100 }
  })
  const totalDiscount = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100

  return { ok: true, preview: { fromPeriod: prevPeriod, items, totalDiscount } }
}

// ── Confirmar pago + generar (mgmt) ────────────────────────────────────────

export interface ConfirmMonthlyPaymentInput {
  childId: string
  periodMonth: string                                       // 'YYYY-MM' o 'YYYY-MM-01'
  paymentAmountUsd: number
  paymentMethod?: 'cash' | 'transfer' | 'card' | 'other'
  paymentReference?: string | null
  paidAt?: string                                           // ISO; default = ahora
  notes?: string | null
  /** Si se manda, se usan EXACTAMENTE estas citas (override del auto-compute).
   *  Útil cuando el usuario movió fechas en el preview drag-and-drop. */
  appointmentsOverride?: MonthlyCandidateAppointment[]
  /** Descuento aplicado al ciclo. Si no se manda, queda 'none'. */
  discountKind?: DiscountKind
  discountValue?: number
  discountReason?: string | null
  /**
   * Precios finales por terapia (editados al cobrar). Sobreescriben los precios
   * del snapshot del plan en el ciclo, para que la factura use estos montos.
   */
  pricedTherapies?: { service: string; sessions_per_month: number; unit_cost_usd: number }[]
  /**
   * Fecha límite de pago (periodo de gracia) 'YYYY-MM-DD'. Si no se manda,
   * el RPC usa el día 5 del mes.
   */
  dueDate?: string | null
  /** Rollover de sesiones no dadas del mes anterior. */
  rolloverMode?: 'none' | 'accumulate' | 'discount'
  /** service → sesiones a acumular (modo accumulate) o base del descuento. */
  rolloverSessions?: Record<string, number> | null
  /** Monto del descuento por rollover (modo discount). */
  rolloverDiscountUsd?: number
}

export async function confirmMonthlyPaymentAndGenerate(
  input: ConfirmMonthlyPaymentInput,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  if (!Number.isFinite(input.paymentAmountUsd) || input.paymentAmountUsd < 0) {
    return { ok: false, error: 'Monto de pago inválido.' }
  }

  let periodMonth: string
  try {
    periodMonth = normalizePeriodMonth(input.periodMonth)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Período inválido.' }
  }

  const discountKind: DiscountKind = input.discountKind ?? 'none'
  const discountValue = Number(input.discountValue ?? 0)
  const discountError = validateDiscount({ kind: discountKind, value: discountValue })
  if (discountError) return { ok: false, error: discountError }

  const { data, error } = await supabase.rpc('confirm_monthly_payment_and_generate', {
    p_child_id: input.childId,
    p_period_month: periodMonth,
    p_payment_amount: input.paymentAmountUsd,
    p_payment_method: input.paymentMethod ?? 'cash',
    p_payment_reference: input.paymentReference ?? null,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
    p_notes: input.notes ?? null,
    p_appointments_override: input.appointmentsOverride ?? null,
    p_due_date: input.dueDate ?? null,
    p_rollover_sessions:
      input.rolloverSessions && Object.keys(input.rolloverSessions).length > 0
        ? input.rolloverSessions
        : null,
    p_rollover_mode: input.rolloverMode ?? 'none',
    p_rollover_discount: input.rolloverDiscountUsd ?? 0,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('no_active_treatment_plan')) {
      return { ok: false, error: 'El niño no tiene plan de tratamiento activo.' }
    }
    if (msg.includes('plan_has_no_primary_therapist')) {
      return { ok: false, error: 'El plan no tiene terapista principal asignada.' }
    }
    if (
      msg.includes('cycle_already_exists_for_period') ||
      msg.includes('monthly_session_cycles_child_id_period_month_key') ||
      msg.includes('monthly_session_cycles_active_unique') ||
      msg.includes('duplicate key value') // fallback genérico para constraint violations
    ) {
      return {
        ok: false,
        error: 'Ya existe un ciclo activo para este niño y mes. Si el anterior fue anulado, recargá la página e intentá de nuevo.',
      }
    }
    if (msg.includes('override_date_out_of_period')) {
      return {
        ok: false,
        error: 'Una cita fue movida fuera del mes seleccionado. Restaurala o moverla dentro del mes.',
      }
    }
    if (msg.includes('has_conflicts')) {
      return {
        ok: false,
        error:
          'Hay conflictos de horario con otros appointments del terapista. Verificá la previsualización y resolvé antes de confirmar.',
      }
    }
    return { ok: false, error: error.message ?? 'Error al confirmar el ciclo.' }
  }

  let cycle = data as MonthlySessionCycle

  // Parchar el snapshot del ciclo con los precios editados al cobrar + descuento.
  // La factura (createInvoiceForCycle) lee precios de treatment_plan_snapshot,
  // así que actualizamos ahí los unit_cost_usd con lo que la persona definió.
  if (cycle?.id) {
    const updatePayload: Record<string, unknown> = {}

    if (discountKind !== 'none' && discountValue > 0) {
      updatePayload.discount_kind = discountKind
      updatePayload.discount_value = discountValue
      updatePayload.discount_reason = input.discountReason ?? null
    }

    if (input.pricedTherapies && input.pricedTherapies.length > 0) {
      const priceBy = new Map(
        input.pricedTherapies.map((p) => [p.service, p.unit_cost_usd]),
      )
      const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
        therapies_json?: { service: string; unit_cost_usd?: number }[]
      }
      const therapies = (snapshot.therapies_json ?? []).map((t) => ({
        ...t,
        unit_cost_usd: priceBy.has(t.service) ? priceBy.get(t.service)! : (t.unit_cost_usd ?? 0),
      }))
      updatePayload.treatment_plan_snapshot = { ...snapshot, therapies_json: therapies }

      // Monto esperado del ciclo (pendiente) = subtotal priced − descuento.
      const subtotal = input.pricedTherapies.reduce(
        (sum, p) => sum + p.sessions_per_month * p.unit_cost_usd,
        0,
      )
      let expected = subtotal
      if (discountKind === 'percent' && discountValue > 0) {
        expected = subtotal * (1 - discountValue / 100)
      } else if (discountKind === 'fixed' && discountValue > 0) {
        expected = Math.max(0, subtotal - discountValue)
      }
      updatePayload.payment_amount_usd = Math.round(expected * 100) / 100
    }

    if (Object.keys(updatePayload).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated } = await (supabase as any)
        .from('monthly_session_cycles')
        .update(updatePayload)
        .eq('id', cycle.id)
        .select('*')
        .single()
      if (updated) cycle = updated as MonthlySessionCycle
    }
  }

  // Auto-generar factura para el ciclo recién creado.
  // Es best-effort: si falla, el ciclo queda registrado igual y la factura
  // se puede generar manualmente desde el historial de facturas.
  if (cycle?.id) {
    await createInvoiceForCycle(cycle.id).catch((err) => {
      console.error('[monthly-cycles] auto-invoice failed:', err)
    })
  }

  revalidatePath('/familias')
  revalidatePath('/agenda')
  return { ok: true, cycle }
}

// ── Marcar ciclo como pagado (mgmt) — aplica recargo por mora ───────────────

export interface MarkCyclePaidInput {
  cycleId: string
  paymentMethod?: 'cash' | 'transfer' | 'card' | 'other'
  paymentReference?: string | null
  paidAt?: string // ISO; default = ahora
}

export async function markMonthlyCyclePaid(
  input: MarkCyclePaidInput,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }

  const { data, error } = await supabase.rpc('mark_monthly_cycle_paid', {
    p_cycle_id: input.cycleId,
    p_payment_method: input.paymentMethod ?? 'cash',
    p_payment_reference: input.paymentReference ?? null,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('cycle_not_found')) return { ok: false, error: 'Ciclo no encontrado.' }
    if (msg.includes('cycle_cancelled')) return { ok: false, error: 'El ciclo está anulado.' }
    if (msg.includes('cycle_already_paid')) return { ok: false, error: 'El ciclo ya está pagado.' }
    return { ok: false, error: error.message ?? 'Error al marcar el pago.' }
  }

  revalidatePath('/familias')
  revalidatePath('/ninos')
  return { ok: true, cycle: data as MonthlySessionCycle }
}

// ── Prorrogar el periodo de gracia de un ciclo (mgmt) ───────────────────────

export async function extendMonthlyCycleGrace(
  cycleId: string,
  newDate: string, // 'YYYY-MM-DD'
  reason: string,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: 'Fecha inválida (esperado YYYY-MM-DD).' }
  }
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: 'Indicá una justificación para la prórroga.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('monthly_session_cycles')
    .update({ grace_extended_to: newDate, grace_extension_reason: reason.trim() })
    .eq('id', cycleId)
    .eq('payment_status', 'pending')
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message ?? 'Error al prorrogar la gracia.' }

  revalidatePath('/familias')
  revalidatePath('/ninos')
  return { ok: true, cycle: data as MonthlySessionCycle }
}

// ── Anular un ciclo (admin/directora) ──────────────────────────────────────

export async function cancelMonthlyCycle(
  cycleId: string,
  reason: string,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!['admin', 'directora'].includes(user.role)) {
    return { ok: false, error: 'Solo admin/directora pueden anular ciclos.' }
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
  }

  const { data, error } = await supabase.rpc('cancel_monthly_cycle', {
    p_cycle_id: cycleId,
    p_reason: reason.trim(),
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('cycle_not_found')) return { ok: false, error: 'Ciclo no encontrado.' }
    if (msg.includes('reason_too_short')) return { ok: false, error: 'Motivo muy corto.' }
    return { ok: false, error: 'Error al anular el ciclo.' }
  }

  revalidatePath('/familias')
  revalidatePath('/agenda')
  return { ok: true, cycle: data as MonthlySessionCycle }
}
