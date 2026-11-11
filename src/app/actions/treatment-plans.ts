'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  TreatmentPlan,
  TreatmentPlanChange,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
  ServiceCatalogItem,
  ServiceType,
  DayOfWeek,
  DiscountKind,
} from '@/types/db'
import { SERVICE_TYPE_LABELS, DAY_OF_WEEK_LABELS } from '@/types/db'
import { applyDiscount, validateDiscount } from '@/lib/domain/discounts'
import { therapyLineAmount, isMorningProgramService, planTherapistIds } from '@/lib/domain/billing/monthly-flat'
import { withCatalogPrices, withPreservedPrices } from '@/lib/domain/billing/catalog-price'
import { withPreservedOverrides } from '@/lib/domain/billing/manual-overrides'
import { createInvoiceForCycle } from './kinetic-invoices'
import { syncCycleChargeToAgenda } from './cycle-charge-sync'
import { duplicateScheduleSlots, scheduleSignature } from '@/lib/domain/agenda-plan-sync'
import { applyCycleAgendaSync, buildCycleAgendaSync } from '@/lib/domain/agenda-plan-sync-db'
import { isChildClosed, isChildPaused } from '@/lib/domain/intake-pipeline'
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
    // En qué semanas cae un horario quincenal (0 = 1ª/3ª, 1 = 2ª/4ª). Este campo
    // se descartaba acá: el editor dejaba elegir "2ª y 4ª", el plan se guardaba
    // sin él y el niño salía agendado en la 1ª y 3ª — días que no le tocan.
    const offset = freq === 'biweekly' && Number(s.biweekly_offset) === 1 ? 1 : 0
    result.push({
      day_of_week: s.day_of_week as DayOfWeek,
      time_local: s.time_local,
      duration_minutes: Math.floor(dur),
      service: s.service as ServiceType,
      frequency: freq,
      ...(freq === 'biweekly' ? { biweekly_offset: offset as 0 | 1 } : {}),
    })
  }
  // Dos horarios idénticos (misma terapia, día y hora) son un error de carga: el
  // segundo casi siempre debía ser media hora después. No se puede adivinar cuál
  // era la intención, y dejarlo pasar agenda dos citas encimadas o —al
  // sincronizar— la mitad de las sesiones. Pasó con un plan real en nov 2026.
  const dup = duplicateScheduleSlots(result)[0]
  if (dup) {
    return (
      `Hay dos horarios iguales: ${DAY_OF_WEEK_LABELS[dup.day_of_week]} ${dup.time_local} · ` +
      `${SERVICE_TYPE_LABELS[dup.service] ?? dup.service}. ` +
      'Cambiá la hora de uno (por ejemplo, media hora después) o quitá el repetido.'
    )
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
  /**
   * Alcance de la propagación a la agenda ya generada al editar el horario
   * (prompt estilo Google Calendar). Desacople F2:
   *  - 'only_future' (default): mueve solo las citas futuras del mes en curso.
   *  - 'skip_agenda': no toca la agenda ya generada (aplica desde el próximo mes).
   */
  scheduleScope?: 'only_future' | 'skip_agenda'
}

/** Resultado de llevar el plan editado a la agenda ya generada. */
export interface PlanRegenSummary {
  /** Cuántos ciclos quedaron con la agenda al día. */
  regenerated: number
  /** Meses ('YYYY-MM') cuya agenda NO se pudo actualizar. */
  conflictMonths: string[]
  /** Por qué falló cada uno (para mostrarle a la persona la causa real). */
  failures?: { month: string; error: string }[]
  /** Meses ('YYYY-MM') de ciclos PAGADOS cuyo monto cambió → se registró un ajuste
   *  que se cobrará el mes siguiente (desacople F2). */
  adjustedPaidMonths?: string[]
  /** Citas canceladas / creadas en total, para el resumen. */
  cancelledAppointments?: number
  createdAppointments?: number
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
  const beforeSignature = scheduleSignature(
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

  // ── Llevar el plan a la agenda ya generada ───────────────────────────────
  //    El plan es la plantilla; las citas las crea el ciclo. Si cambia lo que el
  //    plan agenda, los ciclos ya generados tienen que enterarse o el niño sigue
  //    saliendo en el horario viejo.
  //
  //    QUÉ SE TOCA (nov 2026 — tres huecos que dejaban la agenda vieja):
  //
  //    1. "No tocar (aplica el próximo mes)" protege SOLO el mes en curso. Antes
  //       se saltaba todos los ciclos, y como el mes siguiente suele estar
  //       generado desde mediados del actual, el cambio nunca le llegaba: el plan
  //       quedaba bien y la agenda del mes nuevo salía con el horario anterior.
  //    2. Los planes con programa matutino también se sincronizan. Se excluían
  //       porque el RPC de regenerar se llevaba las citas matutinas; ahora la
  //       sincronización solo toca terapias (ver agenda-plan-sync-db.ts).
  //    3. Un niño en pausa o con alta/retiro no se re-agenda por editarle el plan.
  //
  //    Solo se toca lo FUTURO; lo ya dado nunca. Ciclos pagados incluidos: si su
  //    monto cambia, la diferencia va a billing_adjustment_usd (mes siguiente).
  let regen: PlanRegenSummary | undefined
  const afterSignature = scheduleSignature(therapiesValidated, scheduleValidated)
  const hasMorning = therapiesValidated.some(
    (t) => t.active && isMorningProgramService(t.service),
  )
  const scheduleScope = input.scheduleScope ?? 'only_future'
  if (kind === 'update' && afterSignature !== beforeSignature) {
    const now = new Date()
    const nowISO = now.toISOString()
    const sv = toZonedTime(now, 'America/El_Salvador')
    const currentMonthStart = `${sv.getFullYear()}-${String(sv.getMonth() + 1).padStart(2, '0')}-01`
    const admin = createAdminClient()

    const { data: childRow } = await admin
      .from('children')
      .select('current_phase_code')
      .eq('id', input.childId)
      .maybeSingle()
    const phase = (childRow as { current_phase_code?: string | null } | null)?.current_phase_code
    const childInactive = isChildPaused(phase) || isChildClosed(phase)

    const { data: cyclesRaw } = childInactive
      ? { data: [] }
      : await supabase
          .from('monthly_session_cycles')
          .select('id, period_month, payment_status, paid_expected_usd, invoice_id, discount_kind, discount_value, rollover_mode, rollover_discount_usd, treatment_plan_snapshot')
          .eq('child_id', input.childId)
          .eq('status', 'generated')
          .gte('period_month', currentMonthStart)

    // Catálogo: respaldo de precio para terapias que el snapshot todavía no
    // tenía (el plan nunca los trae).
    const { data: catalogRaw } = await admin.from('service_catalog').select('*')
    const catalogForPrices = (catalogRaw ?? []) as ServiceCatalogItem[]

    let regenerated = 0
    let cancelledAppointments = 0
    let createdAppointments = 0
    const conflictMonths: string[] = []
    const failures: { month: string; error: string }[] = []
    const adjustedPaidMonths: string[] = []
    type CycleRow = {
      id: string
      period_month: string
      payment_status: string
      paid_expected_usd: number | null
      invoice_id: string | null
      discount_kind: DiscountKind
      discount_value: number
      rollover_mode: string
      rollover_discount_usd: number | null
      treatment_plan_snapshot: Record<string, unknown> | null
    }
    for (const c of (cyclesRaw ?? []) as CycleRow[]) {
      const month = String(c.period_month).slice(0, 7)
      // "No tocar": el mes en curso queda como está (ni agenda ni cobro). Los
      // meses siguientes ya generados SÍ se actualizan — es lo que promete.
      if (scheduleScope === 'skip_agenda' && month === currentMonthStart.slice(0, 7)) continue

      const built = await buildCycleAgendaSync(
        supabase,
        admin,
        { id: c.id, child_id: input.childId, period_month: String(c.period_month) },
        nowISO,
      )
      if (!built.ok) {
        // Sin patrón no se toca nada: dejar las citas como están es mucho menos
        // malo que borrarlas a ciegas.
        console.error(`[upsertTreatmentPlan] ${month}: ${built.error}`)
        conflictMonths.push(month)
        failures.push({ month, error: built.error })
        continue
      }
      const applied = await applyCycleAgendaSync(admin, built.sync, user.id)
      cancelledAppointments += applied.cancelled
      createdAppointments += applied.created
      if (applied.error) {
        console.error(`[upsertTreatmentPlan] agenda ${month} falló:`, applied.error)
        conflictMonths.push(month)
        failures.push({ month, error: applied.error })
        continue
      }
      regenerated += 1

      if (hasMorning) {
        // Plan con programa matutino. Hasta nov 2026 estos planes no pasaban por
        // acá (ni agenda ni cobro), así que NO se les aplica el recálculo de
        // abajo, que re-cotiza el mes con las cuotas del plan y los precios del
        // catálogo: una mensualidad puede tener un precio acordado con la familia
        // y no es este el lugar para tocarla. Se hace lo mismo que al mover una
        // cita a mano: se refresca la copia del horario y el cobro sigue a la
        // agenda con sus guardas de siempre (`syncCycleChargeToAgenda`).
        await admin
          .from('monthly_session_cycles')
          .update({
            treatment_plan_snapshot: {
              ...(c.treatment_plan_snapshot ?? {}),
              schedule_pattern_json: scheduleValidated,
            },
          })
          .eq('id', c.id)
        await syncCycleChargeToAgenda(input.childId, [String(c.period_month).slice(0, 10)])
        continue
      }

      // Refrescar el snapshot con el plan nuevo (therapies + horario) para que la
      // facturación y el detalle de pago lean lo actual (cierre de fuga de snapshot).
      //
      // OJO CON LOS PRECIOS: el plan NO los guarda (se eligen del catálogo al
      // cobrar y viven en el snapshot). Copiar el plan tal cual encima borraba el
      // precio del mes — pasó en prod: el detalle de pago quedó en "$0.00" por
      // sesión.
      const priorTherapies =
        ((c.treatment_plan_snapshot ?? {}) as { therapies_json?: TreatmentPlanTherapyEntry[] })
          .therapies_json ?? []
      // Orden a propósito: manda el CATÁLOGO. Todas las terapias son de 30 min y
      // el catálogo cotiza por media hora, así que es la fuente de precios. El
      // snapshot solo se usa de respaldo para un servicio que el catálogo no
      // tenga cotizado. (Al revés, un plan que parte una sesión de 60 en dos de
      // 30 se quedaba con el precio viejo de 60.)
      // Y encima se preservan las cantidades que alguien fijó a mano en el mes:
      // `therapiesValidated` trae las del PLAN, así que sin esto editar el plan
      // borraba la corrección del cobro en silencio.
      const pricedTherapies = withPreservedOverrides(
        withPreservedPrices(
          withCatalogPrices(therapiesValidated, catalogForPrices).therapies,
          priorTherapies,
        ),
        priorTherapies,
      )

      const mergedSnapshot = {
        ...(c.treatment_plan_snapshot ?? {}),
        therapies_json: pricedTherapies,
        schedule_pattern_json: scheduleValidated,
      }
      await admin
        .from('monthly_session_cycles')
        .update({ treatment_plan_snapshot: mergedSnapshot })
        .eq('id', c.id)

      // Monto esperado del ciclo con el plan nuevo (subtotal − descuento del ciclo
      // − descuento por rollover). Se calcula con los precios ya resueltos: con
      // los del plan (en cero) daba 0, y en un ciclo PAGADO eso se convertía en un
      // crédito por el total a favor de la familia.
      const cycleSubtotal = recalcSubtotal(pricedTherapies)
      let newExpected = cycleSubtotal
      if (c.discount_kind === 'percent' && c.discount_value > 0) {
        newExpected = cycleSubtotal * (1 - c.discount_value / 100)
      } else if (c.discount_kind === 'fixed' && c.discount_value > 0) {
        newExpected = Math.max(0, cycleSubtotal - c.discount_value)
      }
      if (c.rollover_mode === 'discount') {
        newExpected = Math.max(0, newExpected - Number(c.rollover_discount_usd ?? 0))
      }
      newExpected = Math.round(newExpected * 100) / 100

      if (c.payment_status === 'paid') {
        // Ciclo PAGADO: no se toca la factura. La diferencia se arrastra al mes
        // siguiente. Solo si tenemos la base congelada al pagar (paid_expected_usd).
        if (c.paid_expected_usd != null) {
          const adjustment = Math.round((newExpected - c.paid_expected_usd) * 100) / 100
          await admin
            .from('monthly_session_cycles')
            .update({ billing_adjustment_usd: adjustment })
            .eq('id', c.id)
          if (adjustment !== 0) adjustedPaidMonths.push(month)
        }
      } else if (c.invoice_id) {
        // Ciclo PENDIENTE con factura: regenerarla desde el snapshot al día.
        await createInvoiceForCycle(c.id).catch((e) => {
          console.error(`[upsertTreatmentPlan] re-factura ${c.period_month} falló:`, e)
        })
      }
    }
    if (regenerated > 0 || conflictMonths.length > 0) {
      regen = {
        regenerated,
        conflictMonths,
        failures: failures.length > 0 ? failures : undefined,
        adjustedPaidMonths: adjustedPaidMonths.length > 0 ? adjustedPaidMonths : undefined,
        cancelledAppointments,
        createdAppointments,
      }
    }
  }

  // ── Sincronizar el TERAPEUTA en las citas futuras ya generadas ────────────
  //    Refleja en el horario los cambios de terapeuta por servicio del plan,
  //    también cuando el horario no cambió (ahí la sincronización de arriba no
  //    corre). Es no destructivo: no mueve horarios ni recrea citas, solo
  //    reasigna therapist_id de las citas futuras 'scheduled'/'replacement'. Los
  //    programas matutinos se manejan por grupo y se excluyen.
  if (kind === 'update') {
    try {
      const admin = createAdminClient()
      const nowIso = new Date().toISOString()
      for (const t of therapiesValidated) {
        if (!t.active || !t.therapist_id) continue
        if (isMorningProgramService(t.service)) continue
        await admin
          .from('appointments')
          .update({ therapist_id: t.therapist_id })
          .eq('child_id', input.childId)
          .eq('service_type', t.service)
          .eq('event_type', 'terapia')
          .gte('starts_at', nowIso)
          .in('status', ['scheduled', 'replacement'])
          .neq('therapist_id', t.therapist_id)
      }
    } catch (e) {
      console.error('[upsertTreatmentPlan] sync de terapeuta en citas falló:', e)
    }
  }

  revalidatePath('/familias')
  // Revalidar la ficha del niño donde se muestra el plan/horario. Sin esto, el
  // plan recién guardado aparecía viejo y había que guardar 2-3 veces (bug
  // reportado): revalidatePath('/familias') NO cubre la ruta anidada dinámica.
  revalidatePath('/familias/[id]/children/[childId]', 'page')
  revalidatePath('/mis-ninos/[childId]', 'page')
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
