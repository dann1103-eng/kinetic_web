'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  MonthlyCandidateAppointment,
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  DiscountKind,
  TherapyBillingMode,
  TreatmentPlanTherapyEntry,
} from '@/types/db'
import { validateDiscount } from '@/lib/domain/discounts'
import { isMonthlyFlatEntry, therapyLineAmount } from '@/lib/domain/billing/monthly-flat'
import {
  clearSessionsOverride,
  clearUnitCostOverride,
  withSessionsOverride,
  withUnitCostOverride,
} from '@/lib/domain/billing/manual-overrides'
import {
  billableSessionCounts,
  type ChargeableAppt,
} from '@/lib/domain/billing/agenda-charge-sync'
import {
  expectedCycleAmount,
  isCycleEditable,
  type PricedTherapyInput,
} from '@/lib/domain/billing/cycle-edit'
import { createInvoiceForCycle } from './kinetic-invoices'
import { computeMorningCandidates } from '@/lib/domain/billing/morning-candidates'
import { fromZonedTime } from 'date-fns-tz'

/** Cita matutina final a crear (la previsualización del modal o recomputada). */
export interface MorningAppointmentInput {
  service: string
  starts_at: string
  ends_at: string
}

/**
 * (Re)genera las citas matutinas por niño del mes, ligadas a un grupo.
 * Borra las auto-generadas 'scheduled' del mes y reinserta. La maestra es la
 * líder del grupo. Si no se pasa `override`, recomputa del horario del grupo.
 * Usa admin client (gateado por rol en el caller).
 */
async function regenerateMorningAppointments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: {
    childId: string
    periodMonth: string // 'YYYY-MM' o 'YYYY-MM-01'
    programGroupId: string
    attendanceDays: string[]
    actorId: string
    override?: MorningAppointmentInput[] | null
  },
): Promise<void> {
  const ym = opts.periodMonth.slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), 'America/El_Salvador').toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), 'America/El_Salvador').toISOString()

  // Maestra líder + datos del grupo.
  const { data: group } = await admin
    .from('program_groups')
    .select('program, start_time_local, duration_minutes')
    .eq('id', opts.programGroupId)
    .maybeSingle()
  if (!group) return
  const { data: staffRaw } = await admin
    .from('program_group_staff')
    .select('user_id, is_lead')
    .eq('group_id', opts.programGroupId)
  const staff = (staffRaw ?? []) as { user_id: string; is_lead: boolean }[]
  const leadId = staff.find((s) => s.is_lead)?.user_id ?? staff[0]?.user_id ?? null

  // 1) Borrar citas matutinas auto-generadas del mes (scheduled).
  const { data: existing } = await admin
    .from('appointments')
    .select('id, notes')
    .eq('child_id', opts.childId)
    .eq('event_type', 'programa_matutino')
    .eq('status', 'scheduled')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const toDelete = ((existing ?? []) as { id: string; notes: string | null }[])
    .filter((a) => (a.notes ?? '').includes('Auto-generado del ciclo'))
    .map((a) => a.id)
  if (toDelete.length > 0) await admin.from('appointments').delete().in('id', toDelete)

  // 2) Candidatos: override del cliente (iteración en el calendario) o recompute.
  //    null = recomputar del horario del grupo.
  //    [] (vacío) puede significar "aún no cargó" — por eso el modal pasa null
  //    cuando morningCandidates está vacío; solo pasa el array cuando ya tiene datos.
  let candidates: { service: string; starts_at: string; ends_at: string }[]
  if (opts.override !== null && opts.override !== undefined && opts.override.length > 0) {
    candidates = opts.override
  } else {
    const { data: hol } = await admin
      .from('institutional_calendar')
      .select('date, type')
      .gte('date', `${ym}-01`)
      .lt('date', `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`)
      .in('type', ['holiday', 'closure', 'gov_decree', 'kinetic_break'])
    const holidays = ((hol ?? []) as { date: string }[]).map((h) => h.date)
    candidates = computeMorningCandidates({
      group: {
        program: group.program,
        start_time_local: group.start_time_local,
        duration_minutes: group.duration_minutes,
        therapist_id: leadId,
      },
      attendanceDays: opts.attendanceDays,
      periodMonth: ym,
      holidays,
    })
  }
  if (candidates.length === 0) return

  // 3) Insertar. La maestra (therapist_id) es siempre la líder del grupo.
  const rows = candidates.map((c) => ({
    child_id: opts.childId,
    therapist_id: leadId,
    event_type: 'programa_matutino',
    service_type: c.service,
    modality: 'presencial',
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    status: 'scheduled',
    program_group_id: opts.programGroupId,
    created_by_user_id: opts.actorId,
    notes: `Auto-generado del ciclo ${ym}`,
  }))
  await admin.from('appointments').insert(rows)
}

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

/**
 * Dry-run para REGENERAR las citas de un ciclo existente. Igual que el dry-run
 * normal, con dos ajustes:
 *
 *  1. Descarta los conflictos contra las propias citas auto-generadas del ciclo
 *     (las que se van a reemplazar) — si no, el preview marcaría falsos choques
 *     contra sí mismas.
 *  2. Con `onlyFuture`, deja fuera los candidatos cuya fecha ya pasó. Regenerar
 *     un mes EN CURSO sobre las sesiones ya dadas no las "respeta": el RPC solo
 *     cancela las `scheduled`, así que crearía una cita nueva encima de cada
 *     sesión ya completada (duplicado) y el preview las reportaba a todas como
 *     conflicto. Ver `regenerate_cycle_appointments(p_only_future)` (mig 0177).
 */
export async function dryRunCycleRegeneration(
  childId: string,
  periodMonthInput: string,
  onlyFuture = false,
): Promise<
  | { ok: true; result: MonthlyCandidatesResult; preservedPast: Record<string, number> }
  | { ok: false; error: string }
> {
  const base = await dryRunMonthlyGeneration(childId, periodMonthInput)
  if (!base.ok) return base

  let periodMonth: string
  try {
    periodMonth = normalizePeriodMonth(periodMonthInput)
  } catch {
    return { ok: true, result: base.result, preservedPast: {} }
  }

  const { supabase } = await getActor()
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), 'America/El_Salvador').toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), 'America/El_Salvador').toISOString()

  // IDs de las citas scheduled auto-generadas del mes (las que se reemplazarán).
  const { data: ownRaw } = await supabase
    .from('appointments')
    .select('id, notes')
    .eq('child_id', childId)
    .eq('status', 'scheduled')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const ownIds = new Set(
    ((ownRaw ?? []) as { id: string; notes: string | null }[])
      .filter((a) => (a.notes ?? '').includes('Auto-generado del ciclo'))
      .map((a) => a.id),
  )

  let result = base.result
  const preservedPast: Record<string, number> = {}

  if (onlyFuture) {
    // Mismo corte que aplica el RPC: `starts_at >= now()`.
    const nowMs = new Date().getTime()
    const isFuture = (c: { starts_at: string }) => new Date(c.starts_at).getTime() >= nowMs
    const candidates = result.candidates.filter(isFuture)
    const skippedOverquota = result.skipped_overquota.filter(isFuture)
    result = {
      ...result,
      candidates,
      skipped_overquota: skippedOverquota,
      skipped_holidays: result.skipped_holidays.filter(isFuture),
      conflicts: result.conflicts.filter((c) => isFuture(c.candidate)),
      summary: {
        ...result.summary,
        candidate_count: candidates.length,
        skipped_overquota_count: skippedOverquota.length,
      },
    }

    // Citas ya pasadas del mes: el RPC no las toca, así que siguen contando para
    // el cobro. El modal las suma a los candidatos futuros para no bajar el
    // monto al regenerar a mitad de mes.
    const { data: pastRaw } = await supabase
      .from('appointments')
      .select('*')
      .eq('child_id', childId)
      .eq('event_type', 'terapia')
      .gte('starts_at', startISO)
      .lt('starts_at', new Date(nowMs).toISOString())
    for (const [service, n] of billableSessionCounts((pastRaw ?? []) as ChargeableAppt[])) {
      preservedPast[service] = n
    }
  }

  const conflicts =
    ownIds.size === 0
      ? result.conflicts
      : result.conflicts.filter((c) => !ownIds.has(c.conflicting_appointment_id))

  return {
    ok: true,
    result: {
      ...result,
      conflicts,
      summary: { ...result.summary, conflict_count: conflicts.length },
    },
    preservedPast,
  }
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

  // Servicios con mensualidad fija (programas matutinos): suscripción —
  // las faltas no se reponen ni se arrastran al mes siguiente.
  // [Desacople F4 — fuga de snapshot] El billing_mode se lee del snapshot del
  // ciclo ANTERIOR (lo que se facturó ese mes), no del plan vivo. Fallback al
  // plan vivo solo si el snapshot es pre-0147 (sin billing_mode).
  const { data: prevCycle } = await supabase
    .from('monthly_session_cycles')
    .select('treatment_plan_snapshot')
    .eq('child_id', childId)
    .eq('period_month', prevPeriod)
    .neq('status', 'cancelled')
    .maybeSingle()
  const prevSnap = (prevCycle?.treatment_plan_snapshot ?? {}) as {
    therapies_json?: { service: string; unit_cost_usd?: number; billing_mode?: TherapyBillingMode }[]
  }
  const billingModeBy = new Map<string, TherapyBillingMode | undefined>()
  for (const t of prevSnap.therapies_json ?? []) billingModeBy.set(t.service, t.billing_mode)
  if (billingModeBy.size === 0) {
    // Snapshot pre-0147 sin therapies: caer al plan vivo.
    const { data: activePlan } = await supabase
      .from('treatment_plans')
      .select('therapies_json')
      .eq('child_id', childId)
      .eq('active', true)
      .maybeSingle()
    for (const t of (activePlan?.therapies_json ?? []) as TreatmentPlanTherapyEntry[]) {
      billingModeBy.set(t.service, t.billing_mode)
    }
  }

  // No dadas sin reposición, por servicio.
  const missedBy = new Map<string, number>()
  for (const a of appts) {
    const notDelivered = ['no_show', 'late_cancel', 'cancelled'].includes(a.status)
    if (notDelivered && !replaced.has(a.id)) {
      const svc = a.service_type ?? 'otra'
      if (isMonthlyFlatEntry({ service: svc as TreatmentPlanTherapyEntry['service'], billing_mode: billingModeBy.get(svc) })) continue
      missedBy.set(svc, (missedBy.get(svc) ?? 0) + 1)
    }
  }
  if (missedBy.size === 0) return { ok: true, preview: { fromPeriod: prevPeriod, items: [], totalDiscount: 0 } }

  // Precio por servicio: del snapshot del ciclo anterior (lo que pagaron) —
  // ya lo trajimos arriba en prevSnap.
  const priceBy = new Map<string, number>()
  for (const t of prevSnap.therapies_json ?? []) {
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
   * `billing_mode: 'monthly_flat'` ⇒ el monto de la línea es 1 × unit_cost_usd
   * (mensualidad fija de programa matutino), no sesiones × precio.
   */
  pricedTherapies?: {
    service: string
    sessions_per_month: number
    unit_cost_usd: number
    billing_mode?: TherapyBillingMode
  }[]
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
  /** Programa matutino: grupo al que se asigna el niño este mes (mig 0149). */
  programGroupId?: string | null
  /** Días de asistencia del niño en el grupo (ej. ['mon','wed','fri']). */
  attendanceDays?: string[] | null
  /** Citas matutinas finales (previsualización iterada en el calendario). Si se
   *  omiten, se recomputan del horario del grupo. */
  morningAppointments?: MorningAppointmentInput[] | null
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
    p_program_group_id: input.programGroupId ?? null,
    p_attendance_days: input.attendanceDays ?? null,
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
      msg.includes('monthly_session_cycles_active_unique')
    ) {
      return {
        ok: false,
        error: 'Ya existe un ciclo activo para este niño y mes. Si el anterior fue anulado, recargá la página e intentá de nuevo.',
      }
    }
    if (msg.includes('program_group_members_active_child')) {
      return {
        ok: false,
        error: 'Error al asignar al grupo matutino (membresía duplicada). Recargá la página e intentá de nuevo.',
      }
    }
    if (msg.includes('program_group_members_child_group_idx')) {
      return {
        ok: false,
        error: 'Error al asignar al grupo matutino. Recargá la página e intentá de nuevo.',
      }
    }
    if (msg.includes('override_date_out_of_period')) {
      return {
        ok: false,
        error: 'Una cita fue movida fuera del mes seleccionado. Restaurala o moverla dentro del mes.',
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
      // Mapa por servicio con precio Y sesiones editadas al cobrar. Ambos
      // sobreescriben el snapshot del plan para que la factura refleje lo que
      // realmente se cobra (ej. menos sesiones por asuetos/ausencias avisadas).
      const editedBy = new Map(
        input.pricedTherapies.map((p) => [p.service, p]),
      )
      const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
        therapies_json?: { service: string; sessions_per_month?: number; unit_cost_usd?: number }[]
      }
      const therapies = (snapshot.therapies_json ?? []).map((t) => {
        const edited = editedBy.get(t.service)
        return edited
          ? { ...t, sessions_per_month: edited.sessions_per_month, unit_cost_usd: edited.unit_cost_usd }
          : t
      })
      updatePayload.treatment_plan_snapshot = { ...snapshot, therapies_json: therapies }

      // Monto esperado del ciclo (pendiente) = subtotal priced − descuento.
      // Mensualidades fijas (programas matutinos) cuentan 1 × precio.
      const subtotal = input.pricedTherapies.reduce(
        (sum, p) =>
          sum +
          therapyLineAmount({
            service: p.service as TreatmentPlanTherapyEntry['service'],
            billing_mode: p.billing_mode,
            sessions_per_month: p.sessions_per_month,
            unit_cost_usd: p.unit_cost_usd,
          }),
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

  // Programa matutino: generar las citas por niño del grupo (el RPC factura la
  // mensualidad pero no crea citas matutinas).
  if (input.programGroupId) {
    const admin = createAdminClient()
    await regenerateMorningAppointments(admin, {
      childId: input.childId,
      periodMonth,
      programGroupId: input.programGroupId,
      attendanceDays: input.attendanceDays ?? [],
      actorId: user.id,
      override: input.morningAppointments ?? null,
    }).catch((err) => {
      console.error('[monthly-cycles] morning appts failed:', err)
    })

    // Generar las sesiones de grupo del mes (idempotente) para que la agenda y
    // mi-día muestren los bloques de grupo y se pueda pasar lista. Best-effort.
    const { error: genErr } = await supabase.rpc('generate_group_sessions_for_month', {
      p_group_id: input.programGroupId,
      p_month: periodMonth,
    })
    if (genErr) console.error('[monthly-cycles] generate group sessions failed:', genErr.message)
  }

  revalidatePath('/familias')
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, cycle }
}

// ── Desacople F1 (spec 2026-07-12): generar agenda SIN factura ───────────────

/** Igual que ConfirmMonthlyPaymentInput pero sin nada de cobro. */
export type GenerateCycleAgendaInput = Omit<
  ConfirmMonthlyPaymentInput,
  'paymentAmountUsd' | 'paymentMethod' | 'paymentReference' | 'paidAt'
>

/**
 * Genera el ciclo del mes + las citas SIN crear factura (invoice_id NULL).
 * Flujo de la coordinadora de terapias: agendar sin ver nada de cobro.
 * Recepción factura después con generateInvoiceForCycle.
 */
export async function generateCycleAgenda(
  input: GenerateCycleAgendaInput,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
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

  const { data, error } = await supabase.rpc('generate_cycle_agenda', {
    p_child_id: input.childId,
    p_period_month: periodMonth,
    p_notes: input.notes ?? null,
    p_appointments_override: input.appointmentsOverride ?? null,
    p_due_date: input.dueDate ?? null,
    p_rollover_sessions:
      input.rolloverSessions && Object.keys(input.rolloverSessions).length > 0
        ? input.rolloverSessions
        : null,
    p_rollover_mode: input.rolloverMode ?? 'none',
    p_rollover_discount: input.rolloverDiscountUsd ?? 0,
    p_program_group_id: input.programGroupId ?? null,
    p_attendance_days: input.attendanceDays ?? null,
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
      msg.includes('monthly_session_cycles_active_unique')
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
    if (msg.includes('function public.generate_cycle_agenda') || msg.includes('schema cache')) {
      return { ok: false, error: 'Falta aplicar la migración 0177 en Supabase.' }
    }
    return { ok: false, error: error.message ?? 'Error al generar la agenda del ciclo.' }
  }

  let cycle = data as MonthlySessionCycle

  // Mismo parche de snapshot que el flujo combinado: precios/sesiones editados
  // y descuento quedan en el ciclo, listos para cuando recepción facture.
  if (cycle?.id) {
    const updatePayload: Record<string, unknown> = {}

    if (discountKind !== 'none' && discountValue > 0) {
      updatePayload.discount_kind = discountKind
      updatePayload.discount_value = discountValue
      updatePayload.discount_reason = input.discountReason ?? null
    }

    if (input.pricedTherapies && input.pricedTherapies.length > 0) {
      const editedBy = new Map(input.pricedTherapies.map((p) => [p.service, p]))
      const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
        therapies_json?: { service: string; sessions_per_month?: number; unit_cost_usd?: number }[]
      }
      const therapies = (snapshot.therapies_json ?? []).map((t) => {
        const edited = editedBy.get(t.service)
        return edited
          ? { ...t, sessions_per_month: edited.sessions_per_month, unit_cost_usd: edited.unit_cost_usd }
          : t
      })
      updatePayload.treatment_plan_snapshot = { ...snapshot, therapies_json: therapies }

      const subtotal = input.pricedTherapies.reduce(
        (sum, p) =>
          sum +
          therapyLineAmount({
            service: p.service as TreatmentPlanTherapyEntry['service'],
            billing_mode: p.billing_mode,
            sessions_per_month: p.sessions_per_month,
            unit_cost_usd: p.unit_cost_usd,
          }),
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

  // Programa matutino: citas por niño + sesiones de grupo (igual que el combinado).
  if (input.programGroupId) {
    const admin = createAdminClient()
    await regenerateMorningAppointments(admin, {
      childId: input.childId,
      periodMonth,
      programGroupId: input.programGroupId,
      attendanceDays: input.attendanceDays ?? [],
      actorId: user.id,
      override: input.morningAppointments ?? null,
    }).catch((err) => {
      console.error('[monthly-cycles] morning appts failed:', err)
    })

    const { error: genErr } = await supabase.rpc('generate_group_sessions_for_month', {
      p_group_id: input.programGroupId,
      p_month: periodMonth,
    })
    if (genErr) console.error('[monthly-cycles] generate group sessions failed:', genErr.message)
  }

  revalidatePath('/familias')
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, cycle }
}

/**
 * Genera (o regenera, si está pendiente) la factura de un ciclo desde el
 * snapshot al día. El botón de recepción en el historial de ciclos.
 */
export async function generateInvoiceForCycle(
  cycleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  const res = await createInvoiceForCycle(cycleId)
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath('/familias')
  revalidatePath('/billing/invoices')
  return { ok: true }
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

  const cycle = data as MonthlySessionCycle

  // [Desacople F1] Congelar paid_expected_usd: total esperado del snapshot al
  // momento de pagar, NETO de líneas arrastradas (mora/ajustes de otros meses).
  // Base para calcular billing_adjustment_usd si el plan cambia después (F2).
  // Best-effort: si falla, el pago quedó registrado igual.
  try {
    const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
      therapies_json?: {
        service: string
        active?: boolean
        billing_mode?: TherapyBillingMode
        sessions_per_month?: number
        unit_cost_usd?: number
      }[]
    }
    const subtotal = (snapshot.therapies_json ?? [])
      .filter((t) => t.active !== false)
      .reduce(
        (sum, t) =>
          sum +
          therapyLineAmount({
            service: t.service as TreatmentPlanTherapyEntry['service'],
            billing_mode: t.billing_mode,
            sessions_per_month: t.sessions_per_month ?? 0,
            unit_cost_usd: t.unit_cost_usd ?? 0,
          }),
        0,
      )
    let expected = subtotal
    if (cycle.discount_kind === 'percent' && cycle.discount_value > 0) {
      expected = subtotal * (1 - cycle.discount_value / 100)
    } else if (cycle.discount_kind === 'fixed' && cycle.discount_value > 0) {
      expected = Math.max(0, subtotal - cycle.discount_value)
    }
    if (cycle.rollover_mode === 'discount') {
      expected = Math.max(0, expected - Number(cycle.rollover_discount_usd ?? 0))
    }
    await createAdminClient()
      .from('monthly_session_cycles')
      .update({ paid_expected_usd: Math.round(expected * 100) / 100 })
      .eq('id', cycle.id)
  } catch (e) {
    console.error('[monthly-cycles] paid_expected_usd freeze failed:', e)
  }

  revalidatePath('/familias')
  revalidatePath('/ninos')
  return { ok: true, cycle }
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

// ── Editar un ciclo pendiente (mgmt) ───────────────────────────────────────

export interface EditMonthlyCycleInput {
  cycleId: string
  /** Detalle de cobro editado: terapias con sesiones/mes y precio unitario. */
  pricedTherapies: PricedTherapyInput[]
  discountKind?: DiscountKind
  discountValue?: number
  discountReason?: string | null
  /** Fecha límite de pago 'YYYY-MM-DD'. Si no se manda, se respeta la actual. */
  dueDate?: string | null
  /** Justificación del cambio (obligatoria, queda en las notas para auditoría). */
  reason: string
  notes?: string | null
  /** Si true, regenera las citas del mes según el plan/override. */
  regenerateAppointments?: boolean
  /**
   * Al regenerar, tocar solo las citas futuras. Necesario en un mes EN CURSO:
   * el RPC solo cancela las `scheduled`, así que regenerar el mes completo
   * crearía una cita nueva encima de cada sesión ya dada (duplicado).
   */
  regenerateOnlyFuture?: boolean
  /** Citas exactas a crear al regenerar (override del auto-compute). */
  appointmentsOverride?: MonthlyCandidateAppointment[] | null
  /** Programa matutino: grupo al que se (re)asigna el niño + sus días. */
  programGroupId?: string | null
  attendanceDays?: string[] | null
  /** Citas matutinas finales (previsualización iterada). Si se omiten con grupo
   *  presente, se recomputan del horario del grupo. */
  morningAppointments?: MorningAppointmentInput[] | null
}

export async function editMonthlyCycle(
  input: EditMonthlyCycleInput,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, error: 'Indicá una justificación del cambio.' }
  }

  const discountKind: DiscountKind = input.discountKind ?? 'none'
  const discountValue = Number(input.discountValue ?? 0)
  const discountError = validateDiscount({ kind: discountKind, value: discountValue })
  if (discountError) return { ok: false, error: discountError }

  // Cargar el ciclo y validar que sea editable (generado + pendiente).
  const { data: cycleRaw, error: loadErr } = await supabase
    .from('monthly_session_cycles')
    .select('*')
    .eq('id', input.cycleId)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!cycleRaw) return { ok: false, error: 'Ciclo no encontrado.' }
  const cycle = cycleRaw as MonthlySessionCycle
  if (!isCycleEditable(cycle)) {
    return {
      ok: false,
      error: 'Solo se pueden editar ciclos generados y aún pendientes de pago.',
    }
  }

  // 1) Regenerar citas PRIMERO (si se pidió): si hay conflictos, no tocamos el
  //    cobro — el usuario resuelve y reintenta.
  if (input.regenerateAppointments) {
    const { error: regenErr } = await supabase.rpc('regenerate_cycle_appointments', {
      p_cycle_id: cycle.id,
      p_appointments_override: input.appointmentsOverride ?? null,
      p_only_future: input.regenerateOnlyFuture ?? false,
    })
    if (regenErr) {
      const msg = regenErr.message ?? ''
      if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
      if (msg.includes('cycle_not_editable')) {
        return { ok: false, error: 'El ciclo ya no es editable (¿se pagó o anuló?).' }
      }
      if (msg.includes('no_active_treatment_plan')) {
        return { ok: false, error: 'El niño no tiene plan de tratamiento activo.' }
      }
      if (msg.includes('plan_has_no_primary_therapist')) {
        return { ok: false, error: 'El plan no tiene terapista principal asignada.' }
      }
      if (msg.includes('override_date_out_of_period')) {
        return { ok: false, error: 'Una cita quedó fuera del mes. Movela dentro del mes.' }
      }
      return { ok: false, error: msg || 'Error al regenerar las citas.' }
    }
  }

  // 2) Reconstruir therapies_json del snapshot desde el detalle editado.
  //    Las terapias del detalle mandan (agregar/quitar); se preservan campos
  //    extra (therapist_id, days_per_week) de la entrada previa por servicio.
  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
    [k: string]: unknown
  }
  const existingByService = new Map<string, TreatmentPlanTherapyEntry>(
    (snapshot.therapies_json ?? []).map((t) => [t.service, t]),
  )
  const newTherapies = input.pricedTherapies.map((p) => {
    const old = existingByService.get(p.service)
    const merged = {
      ...(old ?? {}),
      service: p.service,
      active: true,
      sessions_per_month: p.sessions_per_month,
      unit_cost_usd: p.unit_cost_usd,
      ...(p.billing_mode ? { billing_mode: p.billing_mode } : {}),
    } as TreatmentPlanTherapyEntry
    // Las marcas se escriben o se borran según lo que llegue, nunca se heredan
    // del `...old`: si no, "volver a automático" no podría quitarlas.
    let out = p.sessionsOverridden
      ? withSessionsOverride(merged, p.sessions_per_month)
      : clearSessionsOverride(merged)
    out = p.unitCostOverridden
      ? withUnitCostOverride(out, p.unit_cost_usd)
      : clearUnitCostOverride(out)
    return out
  })
  // [Desacople F4 — fuga de snapshot] Refrescar también schedule_pattern_json del
  // plan vivo, para que el detalle de pago (PDF) no caiga al plan vivo por falta
  // de horario en el snapshot.
  let newSchedulePattern = (snapshot as { schedule_pattern_json?: unknown }).schedule_pattern_json
  {
    const { data: livePlan } = await supabase
      .from('treatment_plans')
      .select('schedule_pattern_json')
      .eq('child_id', cycle.child_id)
      .eq('active', true)
      .maybeSingle()
    if (livePlan?.schedule_pattern_json) newSchedulePattern = livePlan.schedule_pattern_json
  }
  const newSnapshot = {
    ...snapshot,
    therapies_json: newTherapies,
    ...(newSchedulePattern ? { schedule_pattern_json: newSchedulePattern } : {}),
  }

  const expected = expectedCycleAmount(input.pricedTherapies, {
    kind: discountKind,
    value: discountValue,
  })

  // Auditoría: dejar una línea con la justificación en las notas del ciclo.
  const stamp = new Date().toLocaleDateString('es-SV', { timeZone: 'America/El_Salvador' })
  const auditLine = `[Editado ${stamp} · ${input.reason.trim()}]`
  const baseNotes = input.notes?.trim() ?? cycle.notes ?? ''
  const newNotes = baseNotes ? `${baseNotes}\n${auditLine}` : auditLine

  // 3) Parchar el cobro del ciclo. El guard payment_status='pending' evita una
  //    carrera si alguien lo marcó pagado entre la carga y este update.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updErr } = await (supabase as any)
    .from('monthly_session_cycles')
    .update({
      treatment_plan_snapshot: newSnapshot,
      payment_amount_usd: expected,
      due_date: input.dueDate ?? cycle.due_date,
      discount_kind: discountKind,
      discount_value: discountKind === 'none' ? 0 : discountValue,
      discount_reason: discountKind === 'none' ? null : input.discountReason ?? null,
      notes: newNotes,
      ...(input.programGroupId
        ? { program_group_id: input.programGroupId, attendance_days: input.attendanceDays ?? [] }
        : {}),
    })
    .eq('id', cycle.id)
    .eq('payment_status', 'pending')
    .select('*')
    .single()
  if (updErr) return { ok: false, error: updErr.message ?? 'Error al guardar los cambios.' }

  // 4) Programa matutino: upsert de membresía + (re)generar las citas del niño.
  if (input.programGroupId) {
    const admin = createAdminClient()
    // [0152] Membresía idempotente: desactivar TODOS los registros activos del
    // niño primero, luego upsert del grupo destino por (child_id, group_id).
    // Evita la violación del índice único (child_id) WHERE active.
    await admin
      .from('program_group_members')
      .update({ active: false })
      .eq('child_id', cycle.child_id)
      .eq('active', true)
    const { data: existingMember } = await admin
      .from('program_group_members')
      .select('id')
      .eq('child_id', cycle.child_id)
      .eq('group_id', input.programGroupId)
      .maybeSingle()
    if (existingMember) {
      await admin
        .from('program_group_members')
        .update({ active: true, attendance_days: input.attendanceDays ?? [] })
        .eq('child_id', cycle.child_id)
        .eq('group_id', input.programGroupId)
    } else {
      await admin.from('program_group_members').insert({
        group_id: input.programGroupId,
        child_id: cycle.child_id,
        attendance_days: input.attendanceDays ?? [],
        active: true,
      })
    }
    await regenerateMorningAppointments(admin, {
      childId: cycle.child_id,
      periodMonth: cycle.period_month,
      programGroupId: input.programGroupId,
      attendanceDays: input.attendanceDays ?? [],
      actorId: user.id,
      override: input.morningAppointments ?? null,
    }).catch((err) => {
      console.error('[monthly-cycles] edit morning appts failed:', err)
    })

    // Sesiones de grupo del mes (idempotente) — agenda / mi-día. Best-effort.
    const { error: genErr } = await supabase.rpc('generate_group_sessions_for_month', {
      p_group_id: input.programGroupId,
      p_month: `${String(cycle.period_month).slice(0, 7)}-01`,
    })
    if (genErr) console.error('[monthly-cycles] edit generate group sessions failed:', genErr.message)
  }

  // 5) Refrescar la factura existente (idempotente: parcha la misma factura).
  await createInvoiceForCycle(cycle.id).catch((err) => {
    console.error('[monthly-cycles] edit re-invoice failed:', err)
  })

  revalidatePath('/familias')
  revalidatePath('/ninos')
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, cycle: updated as MonthlySessionCycle }
}

// ── Anular un ciclo (admin/directora/coordinadora_familias) ─────────────────

const CAN_CANCEL_ROLES = ['admin', 'directora', 'coordinadora_familias']

export async function cancelMonthlyCycle(
  cycleId: string,
  reason: string,
): Promise<{ ok: true; cycle: MonthlySessionCycle } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!CAN_CANCEL_ROLES.includes(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coordinadora de familias pueden anular ciclos.' }
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

// ── Desacople F4: anulación separada (factura ↔ agenda) ─────────────────────

/**
 * Anula SOLO la factura del ciclo (void), sin tocar la agenda. El ciclo queda
 * sin factura activa → recepción puede volver a generarla. La factura anulada
 * se conserva para auditoría. Roles de gestión de ciclos.
 */
export async function voidCycleInvoice(
  cycleId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
  }
  const admin = createAdminClient()
  const { data: cycle } = await admin
    .from('monthly_session_cycles')
    .select('id, invoice_id, payment_status')
    .eq('id', cycleId)
    .maybeSingle()
  if (!cycle) return { ok: false, error: 'Ciclo no encontrado.' }
  if (!cycle.invoice_id) return { ok: false, error: 'El ciclo no tiene factura.' }
  if (cycle.payment_status === 'paid') {
    return { ok: false, error: 'No se puede anular la factura de un ciclo ya pagado. Usá "Anular todo".' }
  }

  const { error: voidErr } = await admin
    .from('invoices')
    .update({
      status: 'void',
      void_reason: reason.trim(),
      void_by: user.id,
      void_at: new Date().toISOString(),
    })
    .eq('id', cycle.invoice_id)
  if (voidErr) return { ok: false, error: voidErr.message }

  // Desligar la factura del ciclo → habilita "Generar factura" de nuevo.
  await admin
    .from('monthly_session_cycles')
    .update({ invoice_id: null })
    .eq('id', cycleId)

  revalidatePath('/familias')
  revalidatePath('/billing/invoices')
  return { ok: true }
}

/**
 * Cancela SOLO la agenda del mes (las citas futuras 'scheduled' auto-generadas
 * del ciclo → 'rescheduled'), sin tocar la factura ni el estado del ciclo. Las
 * completadas/en curso/reposiciones se conservan. Roles de gestión.
 */
export async function cancelCycleAgenda(
  cycleId: string,
): Promise<{ ok: true; cancelled: number } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  const admin = createAdminClient()
  const { data: cycle } = await admin
    .from('monthly_session_cycles')
    .select('id, child_id, period_month')
    .eq('id', cycleId)
    .maybeSingle()
  if (!cycle) return { ok: false, error: 'Ciclo no encontrado.' }

  const firstDay = `${String(cycle.period_month).slice(0, 7)}-01`
  const nextMonth = new Date(Date.UTC(
    Number(firstDay.slice(0, 4)),
    Number(firstDay.slice(5, 7)), // 0-based next month
    1,
  )).toISOString().slice(0, 10)

  const { data: cancelledRows, error } = await admin
    .from('appointments')
    .update({ status: 'rescheduled', notes: 'Agenda del ciclo cancelada' })
    .eq('child_id', cycle.child_id)
    .eq('event_type', 'terapia')
    .eq('status', 'scheduled')
    .gte('starts_at', firstDay)
    .lt('starts_at', nextMonth)
    .like('notes', '%Auto-generado del ciclo%')
    .select('id')
  if (error) return { ok: false, error: error.message }

  revalidatePath('/familias')
  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, cancelled: (cancelledRows ?? []).length }
}

// ── Eliminar un ciclo por completo (admin) ──────────────────────────────────
// A diferencia de "Anular" (que deja un ciclo cancelado en el historial),
// esto BORRA el ciclo, su factura y las citas auto-generadas aún 'scheduled'
// del mes. Pensado para ciclos de prueba / errores. Usa admin client porque
// no hay policy DELETE en monthly_session_cycles (gateado por rol en código).
export async function deleteMonthlyCycle(
  cycleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (user.role !== 'admin' && user.role !== 'recepcion') {
    return { ok: false, error: 'Solo admin o recepción pueden eliminar un ciclo.' }
  }

  const admin = createAdminClient()

  const { data: cycleRaw, error: loadErr } = await admin
    .from('monthly_session_cycles')
    .select('id, child_id, period_month, invoice_id')
    .eq('id', cycleId)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!cycleRaw) return { ok: false, error: 'Ciclo no encontrado.' }
  const cycle = cycleRaw as {
    id: string
    child_id: string
    period_month: string
    invoice_id: string | null
  }

  // 1) Borrar las citas auto-generadas del mes que siguen 'scheduled' O quedaron
  //    'rescheduled' (superadas por una regeneración o por anular el ciclo). Las
  //    ya iniciadas/completadas/inasistidas se respetan (tienen valor clínico y
  //    no bloquean la agenda). Si no se limpian las 'rescheduled', quedan como
  //    "citas fantasma" ocultas que se acumulan al regenerar/anular ciclos.
  const [y, m] = cycle.period_month.slice(0, 7).split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), 'America/El_Salvador').toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), 'America/El_Salvador').toISOString()

  const { data: apptsRaw } = await admin
    .from('appointments')
    .select('id, notes')
    .eq('child_id', cycle.child_id)
    .in('status', ['scheduled', 'rescheduled'])
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const autoIds = ((apptsRaw ?? []) as { id: string; notes: string | null }[])
    .filter((a) => (a.notes ?? '').includes('Auto-generado del ciclo'))
    .map((a) => a.id)
  if (autoIds.length > 0) {
    await admin.from('appointments').delete().in('id', autoIds)
  }

  // 2) Borrar la factura asociada (items primero por la FK).
  if (cycle.invoice_id) {
    await admin.from('invoice_items').delete().eq('invoice_id', cycle.invoice_id)
    await admin.from('invoices').delete().eq('id', cycle.invoice_id)
  }

  // 3) Borrar el ciclo.
  const { error: delErr } = await admin
    .from('monthly_session_cycles')
    .delete()
    .eq('id', cycle.id)
  if (delErr) return { ok: false, error: delErr.message }

  revalidatePath('/familias')
  revalidatePath('/ninos')
  revalidatePath('/agenda')
  return { ok: true }
}
