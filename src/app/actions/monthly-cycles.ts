'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { MonthlyCandidatesResult, MonthlySessionCycle } from '@/types/db'

const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
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
    return { ok: false, error: 'Error al calcular el ciclo.' }
  }

  return { ok: true, result: data as MonthlyCandidatesResult }
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

  const { data, error } = await supabase.rpc('confirm_monthly_payment_and_generate', {
    p_child_id: input.childId,
    p_period_month: periodMonth,
    p_payment_amount: input.paymentAmountUsd,
    p_payment_method: input.paymentMethod ?? 'cash',
    p_payment_reference: input.paymentReference ?? null,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
    p_notes: input.notes ?? null,
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
    if (msg.includes('cycle_already_exists_for_period')) {
      return {
        ok: false,
        error: 'Ya existe un ciclo activo para este niño y mes. Anulá el anterior si querés rehacerlo.',
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

  revalidatePath('/familias')
  revalidatePath('/agenda')
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
