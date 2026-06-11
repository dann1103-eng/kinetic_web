'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  TreatmentPlan,
  TreatmentPlanChange,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
  ServiceType,
  DayOfWeek,
  DiscountKind,
} from '@/types/db'
import { SERVICE_TYPE_LABELS, DAY_OF_WEEK_LABELS } from '@/types/db'
import { applyDiscount, validateDiscount } from '@/lib/domain/discounts'
import { therapyLineAmount } from '@/lib/domain/billing/monthly-flat'

const MGMT_ROLES = ['admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias', 'recepcion', 'contable'] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isMgmt(role: string): boolean {
  return (MGMT_ROLES as readonly string[]).includes(role)
}

const VALID_SERVICES = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]
const VALID_DAYS = Object.keys(DAY_OF_WEEK_LABELS) as DayOfWeek[]

function validateTherapies(input: unknown): TreatmentPlanTherapyEntry[] | string {
  if (!Array.isArray(input)) return 'Las terapias deben ser una lista.'
  const result: TreatmentPlanTherapyEntry[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return 'Terapia inválida.'
    const t = raw as Record<string, unknown>
    if (!VALID_SERVICES.includes(t.service as ServiceType)) {
      return `Servicio no válido: ${String(t.service)}.`
    }
    const sessions = Number(t.sessions_per_month ?? 0)
    if (!Number.isFinite(sessions) || sessions < 0) return 'Sesiones por mes inválido.'
    const cost = Number(t.unit_cost_usd ?? 0)
    if (!Number.isFinite(cost) || cost < 0) return 'Costo unitario inválido.'
    // Terapista por tipo de terapia (opcional). null/'' → usar primary del plan.
    const rawTherapist = t.therapist_id
    const therapistId =
      typeof rawTherapist === 'string' && rawTherapist.trim() ? rawTherapist.trim() : null
    // Modalidad de cobro (opcional): mensualidad fija para programas matutinos.
    const billingMode = t.billing_mode
    if (billingMode !== undefined && billingMode !== 'per_session' && billingMode !== 'monthly_flat') {
      return 'Modalidad de cobro inválida.'
    }
    let daysPerWeek: number | null = null
    if (t.days_per_week !== undefined && t.days_per_week !== null) {
      const d = Number(t.days_per_week)
      if (!Number.isInteger(d) || d < 1 || d > 7) return 'Días por semana inválido (1-7).'
      daysPerWeek = d
    }
    result.push({
      service: t.service as ServiceType,
      active: t.active !== false,
      sessions_per_month: Math.floor(sessions),
      unit_cost_usd: Math.round(cost * 100) / 100,
      therapist_id: therapistId,
      ...(billingMode ? { billing_mode: billingMode } : {}),
      ...(daysPerWeek !== null ? { days_per_week: daysPerWeek } : {}),
    })
  }
  return result
}

function validateSchedule(input: unknown): TreatmentPlanScheduleSlot[] | string {
  if (!Array.isArray(input)) return 'El horario debe ser una lista.'
  const result: TreatmentPlanScheduleSlot[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return 'Slot de horario inválido.'
    const s = raw as Record<string, unknown>
    if (!VALID_DAYS.includes(s.day_of_week as DayOfWeek)) {
      return `Día de la semana inválido: ${String(s.day_of_week)}.`
    }
    if (typeof s.time_local !== 'string' || !/^\d{2}:\d{2}$/.test(s.time_local)) {
      return 'Hora inválida (formato esperado HH:MM).'
    }
    if (!VALID_SERVICES.includes(s.service as ServiceType)) {
      return `Servicio no válido en el horario: ${String(s.service)}.`
    }
    const dur = Number(s.duration_minutes ?? 30)
    if (!Number.isFinite(dur) || dur < 5 || dur > 240) {
      return 'Duración inválida (5-240 min).'
    }
    const freq = s.frequency ?? 'weekly'
    if (freq !== 'weekly' && freq !== 'biweekly' && freq !== 'monthly') {
      return 'Frecuencia de slot inválida.'
    }
    result.push({
      day_of_week: s.day_of_week as DayOfWeek,
      time_local: s.time_local,
      duration_minutes: Math.floor(dur),
      service: s.service as ServiceType,
      frequency: freq,
    })
  }
  return result
}

function recalcSubtotal(therapies: TreatmentPlanTherapyEntry[]): number {
  return Math.round(
    therapies
      .filter((t) => t.active)
      .reduce((sum, t) => sum + therapyLineAmount(t), 0) * 100,
  ) / 100
}

function recalcMonthlyTotal(
  therapies: TreatmentPlanTherapyEntry[],
  discount: { kind: DiscountKind; value: number } = { kind: 'none', value: 0 },
): number {
  const subtotal = recalcSubtotal(therapies)
  return applyDiscount(subtotal, discount)
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export async function getTreatmentPlanByChild(
  childId: string,
): Promise<TreatmentPlan | null> {
  const { supabase } = await getActor()
  const { data, error } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('child_id', childId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as TreatmentPlan | null) ?? null
}

export async function listTreatmentPlanChanges(
  planId: string,
): Promise<TreatmentPlanChange[]> {
  const { supabase } = await getActor()
  const { data, error } = await supabase
    .from('treatment_plan_changes')
    .select('*')
    .eq('treatment_plan_id', planId)
    .order('changed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as TreatmentPlanChange[]
}

// ── Mutaciones (admin/directora/coordinadora_terapias) ─────────────────────

export interface UpsertTreatmentPlanInput {
  childId: string
  primaryTherapistId: string | null
  diagnosisText: string | null
  startsAt: string | null
  ageAtStartText: string | null
  therapies: TreatmentPlanTherapyEntry[]
  schedulePattern: TreatmentPlanScheduleSlot[]
  observations: string | null
  signedAt?: string | null
  notes?: string
  discountKind?: DiscountKind
  discountValue?: number
  discountReason?: string | null
}

export async function upsertTreatmentPlan(
  input: UpsertTreatmentPlanInput,
): Promise<{ ok: true; plan: TreatmentPlan } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora pueden editar planes.' }
  }
  if (!input.childId) return { ok: false, error: 'Falta el ID del niño/a.' }

  const therapiesValidated = validateTherapies(input.therapies)
  if (typeof therapiesValidated === 'string') return { ok: false, error: therapiesValidated }
  const scheduleValidated = validateSchedule(input.schedulePattern)
  if (typeof scheduleValidated === 'string') return { ok: false, error: scheduleValidated }

  const discountKind: DiscountKind = input.discountKind ?? 'none'
  const discountValue = Number(input.discountValue ?? 0)
  const discountError = validateDiscount({ kind: discountKind, value: discountValue })
  if (discountError) return { ok: false, error: discountError }

  const monthlyTotal = recalcMonthlyTotal(therapiesValidated, {
    kind: discountKind,
    value: discountValue,
  })

  const { data: existing } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('child_id', input.childId)
    .maybeSingle()

  const beforeJson = (existing ?? {}) as Partial<TreatmentPlan>

  const payload = {
    child_id: input.childId,
    primary_therapist_id: input.primaryTherapistId,
    diagnosis_text: input.diagnosisText,
    starts_at: input.startsAt,
    age_at_start_text: input.ageAtStartText,
    therapies_json: therapiesValidated,
    schedule_pattern_json: scheduleValidated,
    observations: input.observations,
    monthly_total_usd: monthlyTotal,
    signed_at: input.signedAt ?? null,
    active: true,
    updated_by_user_id: user.id,
    discount_kind: discountKind,
    discount_value: discountValue,
    discount_reason: input.discountReason ?? null,
  }

  let saved: TreatmentPlan | null = null
  let kind: 'create' | 'update' = 'update'

  if (existing) {
    const { data, error } = await supabase
      .from('treatment_plans')
      .update(payload)
      .eq('id', (existing as TreatmentPlan).id)
      .select('*')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Error al guardar.' }
    saved = data as TreatmentPlan
    kind = 'update'
  } else {
    const { data, error } = await supabase
      .from('treatment_plans')
      .insert({ ...payload, created_by_user_id: user.id })
      .select('*')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Error al crear el plan.' }
    saved = data as TreatmentPlan
    kind = 'create'
  }

  // Append-only audit log (best effort — si falla NO bloquea el save)
  await supabase.from('treatment_plan_changes').insert({
    treatment_plan_id: saved.id,
    changed_by_user_id: user.id,
    before_json: beforeJson,
    after_json: saved as unknown as Partial<TreatmentPlan>,
    kind,
    notes: input.notes ?? null,
  })

  revalidatePath(`/familias`)
  return { ok: true, plan: saved }
}

export async function deactivateTreatmentPlan(
  childId: string,
  notes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora pueden desactivar.' }
  }

  const { data: existing } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('child_id', childId)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'No hay plan que desactivar.' }
  const before = existing as TreatmentPlan
  if (!before.active) return { ok: true }

  const { data, error } = await supabase
    .from('treatment_plans')
    .update({ active: false, updated_by_user_id: user.id })
    .eq('id', before.id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Error al desactivar.' }

  await supabase.from('treatment_plan_changes').insert({
    treatment_plan_id: before.id,
    changed_by_user_id: user.id,
    before_json: before as unknown as Partial<TreatmentPlan>,
    after_json: data as unknown as Partial<TreatmentPlan>,
    kind: 'deactivate',
    notes: notes ?? null,
  })

  revalidatePath(`/familias`)
  return { ok: true }
}
