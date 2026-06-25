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
import { therapyLineAmount, isMorningProgramService, planTherapistIds } from '@/lib/domain/billing/monthly-flat'
import { toZonedTime } from 'date-fns-tz'

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
    // Terapista por tipo de terapia. Ya no hay "terapista principal": cada terapia
    // NO matutina debe tener su terapista (es lo que habilita al niño en "mis niños"
    // de esa persona y asigna sus citas). Las matutinas las cubre el grupo.
    const rawTherapist = t.therapist_id
    const therapistId =
      typeof rawTherapist === 'string' && rawTherapist.trim() ? rawTherapist.trim() : null
    const isActive = t.active !== false
    if (isActive && !isMorningProgramService(t.service as ServiceType) && !therapistId) {
      return `La terapia "${SERVICE_TYPE_LABELS[t.service as ServiceType] ?? String(t.service)}" necesita una terapista asignada.`
    }
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
  /** @deprecated Ya no hay terapista principal. Se ignora; se deriva de las terapias. */
  primaryTherapistId?: string | null
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

/** Resultado de regenerar las citas de los ciclos pendientes tras editar el plan. */
export interface PlanRegenSummary {
  /** Cuántos ciclos pendientes se regeneraron OK. */
  regenerated: number
  /** Meses ('YYYY-MM') cuyo ciclo no se pudo regenerar (conflicto de horario u otro). */
  conflictMonths: string[]
}

/** Campos del plan que afectan QUÉ citas se generan (para detectar cambios reales). */
function computeRelevantSignature(
  therapies: TreatmentPlanTherapyEntry[],
  schedule: TreatmentPlanScheduleSlot[],
): string {
  const t = therapies.map((x) => ({
    service: x.service,
    active: x.active !== false,
    sessions: x.sessions_per_month,
    therapist: x.therapist_id ?? null,
    mode: x.billing_mode ?? null,
    dpw: x.days_per_week ?? null,
  }))
  const s = schedule.map((x) => ({
    d: x.day_of_week,
    t: x.time_local,
    dur: x.duration_minutes,
    svc: x.service,
    f: x.frequency ?? 'weekly',
  }))
  return JSON.stringify({ t, s })
}

export async function upsertTreatmentPlan(
  input: UpsertTreatmentPlanInput,
): Promise<
  | { ok: true; plan: TreatmentPlan; regen?: PlanRegenSummary }
  | { ok: false; error: string }
> {
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
  const beforeSignature = computeRelevantSignature(
    (beforeJson.therapies_json ?? []) as TreatmentPlanTherapyEntry[],
    (beforeJson.schedule_pattern_json ?? []) as TreatmentPlanScheduleSlot[],
  )

  // Ya no hay "terapista principal" en la UI. Mantenemos la columna por
  // compatibilidad (fallback del RPC del ciclo, historial): la derivamos como la
  // primera terapista asignada del plan. Si solo hay matutinos, queda null.
  const derivedPrimary = planTherapistIds(therapiesValidated)[0] ?? null

  const payload = {
    child_id: input.childId,
    primary_therapist_id: derivedPrimary,
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

  // ── Sincronizar la agenda: si cambió el horario/terapias y ya hay ciclos
  //    PENDIENTES, regenerar sus citas para que la agenda refleje el plan nuevo.
  //    (El plan es plantilla; las citas las crea el ciclo. Sin esto, editar el
  //    plan no movía las citas ya generadas — bug reportado.)
  //    Solo planes SIN programa matutino: los matutinos se generan por grupo y se
  //    ajustan desde el ciclo, no desde el horario del plan.
  let regen: PlanRegenSummary | undefined
  const afterSignature = computeRelevantSignature(therapiesValidated, scheduleValidated)
  const hasMorning = therapiesValidated.some(
    (t) => t.active && isMorningProgramService(t.service),
  )
  if (kind === 'update' && afterSignature !== beforeSignature && !hasMorning) {
    const sv = toZonedTime(new Date(), 'America/El_Salvador')
    const currentMonthStart = `${sv.getFullYear()}-${String(sv.getMonth() + 1).padStart(2, '0')}-01`

    const { data: cyclesRaw } = await supabase
      .from('monthly_session_cycles')
      .select('id, period_month')
      .eq('child_id', input.childId)
      .eq('status', 'generated')
      .eq('payment_status', 'pending')
      .gte('period_month', currentMonthStart)

    let regenerated = 0
    const conflictMonths: string[] = []
    for (const c of (cyclesRaw ?? []) as { id: string; period_month: string }[]) {
      const { error: rErr } = await supabase.rpc('regenerate_cycle_appointments', {
        p_cycle_id: c.id,
        p_appointments_override: null,
      })
      if (rErr) {
        conflictMonths.push(c.period_month.slice(0, 7))
      } else {
        regenerated += 1
      }
    }
    if (regenerated > 0 || conflictMonths.length > 0) {
      regen = { regenerated, conflictMonths }
    }
  }

  revalidatePath(`/familias`)
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, plan: saved, regen }
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
