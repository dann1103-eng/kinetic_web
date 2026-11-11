/**
 * agenda-plan-sync-db.ts — glue con la BD de `agenda-plan-sync.ts`.
 *
 * Deja la agenda FUTURA de un ciclo igual al patrón del plan, tocando solo lo
 * que no coincide: cancela las citas automáticas que el plan ya no respalda y
 * crea las que faltan. Lo que ya está donde el plan dice no se toca.
 *
 * POR QUÉ NO SE USA `regenerate_cycle_appointments` PARA ESTO: ese RPC cancela
 * TODAS las citas automáticas del mes y las vuelve a crear. Eso tiene dos
 * problemas que este camino no tiene:
 *
 *  1. Se lleva puestas las citas por-niño de programa matutino (llevan la misma
 *     marca y también están `scheduled`), que el patrón no recrea. Por eso los
 *     planes con programa matutino NUNCA sincronizaban su agenda al editarse, y
 *     un niño de BlueKids + Lenguaje se quedaba con el horario viejo de Lenguaje.
 *  2. Cada pasada deja una lápida `rescheduled` por cita, aunque no cambie nada.
 *     Agosto 2026 juntó 1049 y eso fue lo que tumbó las barras de asistencia
 *     contra el tope de filas de PostgREST.
 *
 * El rol se valida en quien llama; acá se escribe con el cliente admin.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromZonedTime } from 'date-fns-tz'
import type {
  Database,
  MonthlyCandidatesResult,
  ServiceType,
  TreatmentPlanTherapyEntry,
} from '@/types/db'
import {
  AUTO_GENERATED_MARKER,
  driftSeverity,
  fullMonthPattern,
  planAgendaSync,
  scheduledServices,
  type AgendaAppt,
  type AgendaSyncPlan,
  type DriftSeverity,
  type PatternSlot,
} from './agenda-plan-sync'
import type { SuspensionWindow } from './suspensions'

type Client = SupabaseClient<Database>

const TZ = 'America/El_Salvador'

/** Nota que se le agrega a una cita cancelada por no corresponder al plan. */
export const OUT_OF_PLAN_NOTE = 'Fuera del plan — agenda sincronizada'

export interface SyncCycleRef {
  id: string
  child_id: string
  /** 'YYYY-MM-01' */
  period_month: string
}

export interface CycleAgendaSync {
  cycle: SyncCycleRef
  plan: AgendaSyncPlan<PatternSlot>
  severity: DriftSeverity
}

export type BuildSyncResult =
  | { ok: true; sync: CycleAgendaSync }
  | { ok: false; error: string }

/** Primer y último instante (exclusivo) del mes en zona SV. */
function monthWindow(periodMonth: string): { startISO: string; endISO: string } {
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  return {
    startISO: fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString(),
    endISO: fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString(),
  }
}

function explainComputeError(message: string): string {
  if (message.includes('no_active_treatment_plan')) return 'El niño/a no tiene un plan activo.'
  if (message.includes('plan_has_no_primary_therapist')) {
    return 'Hay una terapia del plan sin terapista asignada.'
  }
  if (message.includes('not_authorized')) return 'No autorizado.'
  return `No se pudo calcular el patrón del plan: ${message || 'error desconocido'}`
}

/**
 * Calcula, SIN escribir, qué le sobra y qué le falta a la agenda futura del
 * ciclo frente al plan vivo del niño.
 *
 * @param rpcClient cliente con la sesión del usuario — el RPC del patrón valida
 *                  `is_agency_user()` y con service role no hay usuario.
 * @param admin     service role, para leer plan/citas sin depender de RLS.
 */
export async function buildCycleAgendaSync(
  rpcClient: Client,
  admin: Client,
  cycle: SyncCycleRef,
  nowISO: string,
): Promise<BuildSyncResult> {
  const { data: planRow } = await admin
    .from('treatment_plans')
    .select('therapies_json')
    .eq('child_id', cycle.child_id)
    .eq('active', true)
    .maybeSingle()
  if (!planRow) return { ok: false, error: 'El niño/a no tiene un plan activo.' }
  const therapies = ((planRow as { therapies_json?: unknown }).therapies_json ??
    []) as TreatmentPlanTherapyEntry[]

  // El patrón sale del MISMO RPC que usa la previsualización del ciclo: una sola
  // regla de fechas (frecuencia, semana quincenal, asuetos) para todo.
  const { data: dry, error: dryErr } = await rpcClient.rpc(
    'compute_monthly_appointment_candidates',
    {
      p_child_id: cycle.child_id,
      p_period_month: `${cycle.period_month.slice(0, 7)}-01`,
      p_rollover_sessions: null,
    },
  )
  if (dryErr || !dry) return { ok: false, error: explainComputeError(dryErr?.message ?? '') }
  const dryRun = dry as unknown as MonthlyCandidatesResult

  // Suspensiones avisadas. Si la tabla no existe todavía (mig 0184), no hay.
  const { data: suspRaw } = await admin
    .from('child_suspensions')
    .select('starts_on, ends_on, status')
    .eq('child_id', cycle.child_id)
  const suspensions = ((suspRaw ?? []) as unknown as SuspensionWindow[]).filter(
    (s) => s.status !== 'reverted',
  )

  const expected = fullMonthPattern<PatternSlot>(dryRun, therapies, { nowISO, suspensions })

  // Solo lo futuro del mes: lo pasado nunca se toca.
  const { startISO, endISO } = monthWindow(cycle.period_month)
  const fromISO = nowISO > startISO ? nowISO : startISO
  const { data: apptRaw, error: apptErr } = await admin
    .from('appointments')
    .select('*')
    .eq('child_id', cycle.child_id)
    .gte('starts_at', fromISO)
    .lt('starts_at', endISO)
    .order('starts_at', { ascending: true })
    .order('id', { ascending: true })
  if (apptErr) return { ok: false, error: apptErr.message }

  const plan = planAgendaSync(expected, (apptRaw ?? []) as unknown as AgendaAppt[], {
    nowISO,
    scheduledServices: scheduledServices(therapies),
  })
  return { ok: true, sync: { cycle, plan, severity: driftSeverity(plan) } }
}

export interface ApplySyncResult {
  cancelled: number
  created: number
  /** Citas a las que solo se les corrigió la duración. */
  resized: number
  /** Primer error de escritura, si lo hubo. Lo ya aplicado queda aplicado. */
  error?: string
}

/**
 * Aplica el resultado de `buildCycleAgendaSync`. Idempotente: volver a correrlo
 * sobre una agenda ya alineada no hace nada.
 */
export async function applyCycleAgendaSync(
  admin: Client,
  sync: CycleAgendaSync,
  actorId: string | null,
): Promise<ApplySyncResult> {
  const { cycle, plan } = sync
  const ym = cycle.period_month.slice(0, 7)
  let cancelled = 0
  let created = 0
  let resized = 0
  let error: string | undefined

  for (const { appt, ends_at } of plan.toResize) {
    const { data, error: updErr } = await admin
      .from('appointments')
      .update({ ends_at })
      .eq('id', appt.id)
      .eq('status', 'scheduled')
      .select('id')
    if (updErr) {
      error = error ?? updErr.message
      continue
    }
    resized += (data ?? []).length
  }

  for (const { appt } of plan.toCancel) {
    // El guard de estado evita pisar una cita que alguien inició o movió entre
    // la previsualización y este momento.
    const { data, error: updErr } = await admin
      .from('appointments')
      .update({
        status: 'rescheduled',
        notes: `${appt.notes ?? ''}\n${OUT_OF_PLAN_NOTE}`.trim(),
      })
      .eq('id', appt.id)
      .eq('status', 'scheduled')
      .select('id')
    if (updErr) {
      error = error ?? updErr.message
      continue
    }
    cancelled += (data ?? []).length
  }

  if (plan.toCreate.length > 0) {
    const rows = plan.toCreate.map((c) => ({
      child_id: cycle.child_id,
      therapist_id: c.therapist_id ?? null,
      event_type: 'terapia' as const,
      service_type: c.service as ServiceType,
      modality: 'presencial' as const,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      status: 'scheduled' as const,
      created_by_user_id: actorId,
      notes: `${AUTO_GENERATED_MARKER} ${ym}`,
    }))
    const { data, error: insErr } = await admin
      .from('appointments')
      .insert(rows)
      .select('id')
    if (insErr) error = error ?? insErr.message
    else created = (data ?? []).length
  }

  if (cancelled > 0 || created > 0 || resized > 0) {
    await admin
      .from('monthly_session_cycles')
      .update({ appointments_generated_at: new Date().toISOString() })
      .eq('id', cycle.id)
  }

  return { cancelled, created, resized, ...(error ? { error } : {}) }
}
