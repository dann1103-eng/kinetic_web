/**
 * agenda-plan-sync.ts — la agenda de un niño frente a su plan. Lógica pura.
 *
 * El PLAN es la plantilla (qué terapias, qué días, a qué hora); las CITAS las
 * crea el ciclo del mes. Son dos copias de la misma información y nada las
 * mantenía iguales: cada camino que tocaba una se acordaba —o no— de la otra.
 * De ahí el reporte recurrente de "el plan está bien, pero sale agendado en
 * días y horarios que no le corresponden" o "tiene una terapia agendada que no
 * es de su plan" (nov 2026).
 *
 * Este módulo es la única regla para responder dos preguntas:
 *
 *   1. ¿Qué agenda debería producir el plan?            → `fullMonthPattern`
 *   2. ¿Qué le sobra y qué le falta a la agenda real?   → `planAgendaSync`
 *
 * La usan editar el plan, generar/regenerar un ciclo y la revisión por mes
 * (`/operacion/revisar-agenda`). Que sea una sola es el punto: tres armados
 * paralelos del mismo patrón es exactamente cómo nacieron los desfases.
 */
import type { TreatmentPlanScheduleSlot, TreatmentPlanTherapyEntry } from '@/types/db'
import { isMonthlyFlatEntry } from '@/lib/domain/billing/monthly-flat'
import { isSuspended, type SuspensionWindow } from '@/lib/domain/suspensions'

/** Marca en `appointments.notes` de toda cita creada por un ciclo. */
export const AUTO_GENERATED_MARKER = 'Auto-generado del ciclo'

/**
 * Nota que deja `advanceChildPhase` al cancelar las citas futuras por una pausa,
 * alta o retiro. Sirve para distinguirlas de una cancelación de la familia: esas
 * no se reponen; estas sí, cuando el niño vuelve.
 */
export const PHASE_CANCEL_NOTE_PREFIX = 'Cancelada automáticamente por cambio de fase'

type TherapyLike = Pick<TreatmentPlanTherapyEntry, 'service'> &
  Partial<Pick<TreatmentPlanTherapyEntry, 'active' | 'billing_mode'>>

/**
 * Servicios que el plan agenda por cita: terapia ACTIVA que no es mensualidad
 * fija (los programas matutinos van por sesión de grupo).
 *
 * La CUOTA (`sessions_per_month`) no participa a propósito: desde que el ciclo
 * agenda el patrón completo del mes, una terapia activa se agenda aunque su
 * cuota diga 0. Lo que decide es si la terapia está en el plan y activa.
 */
export function scheduledServices(therapies: TherapyLike[] | null | undefined): Set<string> {
  const set = new Set<string>()
  for (const t of therapies ?? []) {
    if (t.active === false) continue
    if (isMonthlyFlatEntry(t)) continue
    set.add(t.service)
  }
  return set
}

/**
 * Servicios que tienen horario en la programación semanal pero ninguna terapia
 * ACTIVA que los respalde. Aparecen cuando se quita o se cambia una terapia y
 * sus horarios se quedan: el editor no los limpiaba.
 */
export function orphanSlotServices(
  therapies: TherapyLike[] | null | undefined,
  slots: Pick<TreatmentPlanScheduleSlot, 'service'>[] | null | undefined,
): string[] {
  const active = new Set<string>()
  for (const t of therapies ?? []) {
    if (t.active !== false) active.add(t.service)
  }
  const orphans: string[] = []
  for (const s of slots ?? []) {
    if (!active.has(s.service) && !orphans.includes(s.service)) orphans.push(s.service)
  }
  return orphans
}

/**
 * Firma de lo que el plan AGENDA: si dos planes dan la misma firma, generan las
 * mismas citas. Se usa para saber si editar el plan obliga a tocar la agenda.
 */
export function scheduleSignature(
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
    // Solo pesa en quincenales: es en qué semanas cae (1ª/3ª vs 2ª/4ª).
    o: (x.frequency ?? 'weekly') === 'biweekly' ? (x.biweekly_offset ?? 0) : 0,
  }))
  return JSON.stringify({ t, s })
}

/** Una cita que el patrón del plan produce. */
export interface PatternSlot {
  service: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  therapist_id?: string | null
}

export interface FullMonthPatternOptions {
  /** Si viene, solo lo que empieza de ese instante en adelante. */
  nowISO?: string
  /** Suspensiones avisadas: esos días no se agendan. */
  suspensions?: SuspensionWindow[]
}

/**
 * El patrón COMPLETO del mes, a partir del resultado de
 * `compute_monthly_appointment_candidates`.
 *
 * - **Suma `skipped_overquota`.** El RPC topa cada servicio a la cuota del plan
 *   gastándola con las fechas más tempranas; quedarse solo con `candidates`
 *   pierde el final del mes (los cuatro niños sin su lunes 31 de agosto).
 * - **Descarta los servicios que no son una terapia activa del plan.** El RPC
 *   manda a `skipped_overquota` todo horario sin cuota, y eso incluye los
 *   horarios huérfanos de una terapia que ya se quitó: sumarlos a ciegas le
 *   agendaba —y después le cobraba— una terapia que el plan ya no tiene.
 * - Los asuetos (`skipped_holidays`) quedan fuera: no son días hábiles.
 */
export function fullMonthPattern<T extends { service: string; starts_at: string }>(
  dryRun: { candidates: T[]; skipped_overquota: T[] },
  therapies: TherapyLike[] | null | undefined,
  opts: FullMonthPatternOptions = {},
): T[] {
  const services = scheduledServices(therapies)
  const nowMs = opts.nowISO ? new Date(opts.nowISO).getTime() : null
  const suspensions = opts.suspensions ?? []
  return [...dryRun.candidates, ...dryRun.skipped_overquota]
    .filter((c) => services.has(c.service))
    .filter((c) => nowMs === null || new Date(c.starts_at).getTime() >= nowMs)
    .filter((c) => suspensions.length === 0 || !isSuspended(c.starts_at, suspensions))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}

/**
 * Limpia el resultado del dry-run de todo servicio que no sea una terapia activa
 * del plan, y dice cuáles quitó.
 *
 * Se aplica en `dryRunMonthlyGeneration`, que es la ÚNICA puerta por la que el
 * patrón llega a la previsualización de generar y de regenerar un ciclo: así
 * ningún modal puede volver a sumar a ciegas un horario huérfano.
 */
export function stripUnplannedServices<
  T extends { service: string },
  R extends {
    candidates: T[]
    skipped_overquota: T[]
    summary: { candidate_count: number; skipped_overquota_count: number }
  },
>(dryRun: R, therapies: TherapyLike[] | null | undefined): { result: R; unplanned: string[] } {
  const services = scheduledServices(therapies)
  const unplanned: string[] = []
  const keep = (c: T) => {
    if (services.has(c.service)) return true
    if (!unplanned.includes(c.service)) unplanned.push(c.service)
    return false
  }
  const candidates = dryRun.candidates.filter(keep)
  const skipped = dryRun.skipped_overquota.filter(keep)
  if (unplanned.length === 0) return { result: dryRun, unplanned }
  return {
    result: {
      ...dryRun,
      candidates,
      skipped_overquota: skipped,
      summary: {
        ...dryRun.summary,
        candidate_count: candidates.length,
        skipped_overquota_count: skipped.length,
      },
    },
    unplanned,
  }
}

/** Lo mínimo de una cita para compararla con el plan. */
export interface AgendaAppt {
  id: string
  event_type: string
  service_type: string | null
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  parent_appointment_id?: string | null
  suspension_id?: string | null
}

export type DriftReason =
  /** Su servicio no es una terapia activa del plan. */
  | 'not_in_plan'
  /** El servicio sí es del plan, pero ese día/hora no. */
  | 'off_pattern'
  /** Hay otra cita igual en el mismo horario. */
  | 'duplicate'

export interface AgendaSyncPlan<T extends PatternSlot = PatternSlot> {
  /** Citas automáticas futuras que el plan ya no respalda. */
  toCancel: { appt: AgendaAppt; reason: DriftReason }[]
  /** Fechas del patrón que no tienen cita. */
  toCreate: T[]
  /**
   * Citas en el día y hora correctos pero con otra duración (el plan pasó de 30
   * a 60 min, por ejemplo). Se corrige la misma cita: no se cancela ni se recrea.
   */
  toResize: { appt: AgendaAppt; ends_at: string }[]
  /** Citas que ya están exactamente donde el plan dice. */
  kept: number
  keptByService: Record<string, number>
}

const slotKey = (service: string, startsAt: string) =>
  `${service}|${new Date(startsAt).getTime()}`

function isAuto(a: AgendaAppt): boolean {
  return (a.notes ?? '').includes(AUTO_GENERATED_MARKER)
}

/**
 * Compara la agenda futura de un niño con el patrón de su plan y dice qué
 * cancelar y qué crear para que coincidan. No escribe nada.
 *
 * Lo que NUNCA entra a `toCancel`:
 *  - lo que ya pasó o ya se dio (solo se mira de `nowISO` en adelante, y solo
 *    citas `scheduled`);
 *  - las citas agendadas a mano (sin la marca del ciclo): son terapias extra;
 *  - las reposiciones;
 *  - una cita reagendada a mano (`parent_appointment_id`): alguien la movió a
 *    propósito, y su horario original tampoco se repone;
 *  - programas matutinos y citas de una suspensión avisada.
 *
 * Lo que NO se repone en `toCreate`: un horario que ya tiene cualquier cita viva
 * de ese servicio, o una que la familia canceló (se cobra y se acredita por
 * rollover; agendarla de nuevo la duplicaría). La excepción son las que canceló
 * una pausa/alta: esas sí se reponen, porque el niño volvió.
 */
export function planAgendaSync<T extends PatternSlot>(
  expected: T[],
  actual: AgendaAppt[],
  opts: { nowISO: string; scheduledServices: Set<string> },
): AgendaSyncPlan<T> {
  const nowMs = new Date(opts.nowISO).getTime()
  const isFuture = (iso: string) => new Date(iso).getTime() >= nowMs

  const therapy = actual.filter(
    (a) => a.event_type === 'terapia' && a.service_type && isFuture(a.starts_at),
  )

  // Lápidas cuyo reemplazo sigue vivo: alguien reagendó esa cita a mano.
  const liveChildParents = new Set<string>()
  for (const a of actual) {
    if (a.parent_appointment_id && a.status !== 'rescheduled') {
      liveChildParents.add(a.parent_appointment_id)
    }
  }

  // Horarios que ya están cubiertos sin que haya que agendar nada.
  const covered = new Set<string>()
  for (const a of therapy) {
    const key = slotKey(a.service_type as string, a.starts_at)
    if (a.status === 'rescheduled') {
      if (liveChildParents.has(a.id)) covered.add(key)
      continue
    }
    if (a.status === 'scheduled' && isAuto(a) && !a.parent_appointment_id && !a.suspension_id) {
      continue // candidata a quedarse o cancelarse: se resuelve abajo
    }
    if (a.status === 'cancelled' && (a.notes ?? '').startsWith(PHASE_CANCEL_NOTE_PREFIX)) {
      continue // la canceló una pausa: se repone
    }
    covered.add(key)
  }

  const expectedByKey = new Map<string, T>()
  for (const e of expected) {
    if (!isFuture(e.starts_at)) continue
    const key = slotKey(e.service, e.starts_at)
    if (!expectedByKey.has(key)) expectedByKey.set(key, e)
  }

  const toCancel: AgendaSyncPlan<T>['toCancel'] = []
  const toResize: AgendaSyncPlan<T>['toResize'] = []
  const keptByService: Record<string, number> = {}
  const matched = new Set<string>()

  const autos = therapy
    .filter(
      (a) => a.status === 'scheduled' && isAuto(a) && !a.parent_appointment_id && !a.suspension_id,
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() ||
        a.id.localeCompare(b.id),
    )

  for (const a of autos) {
    const service = a.service_type as string
    const key = slotKey(service, a.starts_at)
    if (!opts.scheduledServices.has(service)) {
      toCancel.push({ appt: a, reason: 'not_in_plan' })
    } else if (!expectedByKey.has(key)) {
      toCancel.push({ appt: a, reason: 'off_pattern' })
    } else if (matched.has(key) || covered.has(key)) {
      toCancel.push({ appt: a, reason: 'duplicate' })
    } else {
      matched.add(key)
      const want = expectedByKey.get(key) as T
      if (new Date(want.ends_at).getTime() !== new Date(a.ends_at).getTime()) {
        toResize.push({ appt: a, ends_at: want.ends_at })
      } else {
        keptByService[service] = (keptByService[service] ?? 0) + 1
      }
    }
  }

  const toCreate: T[] = []
  for (const [key, e] of expectedByKey) {
    if (matched.has(key) || covered.has(key)) continue
    toCreate.push(e)
  }
  toCreate.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  const kept = Object.values(keptByService).reduce((s, n) => s + n, 0)
  return { toCancel, toCreate, toResize, kept, keptByService }
}

export type DriftSeverity =
  /** La agenda coincide con el plan. */
  | 'none'
  /** Diferencias sueltas: casi siempre una cita movida a mano. */
  | 'one_off'
  /** La serie entera de un servicio está fuera del plan, o hay una terapia ajena. */
  | 'systematic'

/**
 * Qué tan serio es el desfase. Separa "le movieron una cita" (pasa todas las
 * semanas, es intencional) de "todo el horario de esta terapia es el viejo",
 * que es lo que hay que corregir.
 */
export function driftSeverity(plan: AgendaSyncPlan): DriftSeverity {
  if (!hasDrift(plan)) return 'none'
  if (plan.toCancel.some((c) => c.reason === 'not_in_plan')) return 'systematic'

  const touched = new Set<string>()
  for (const c of plan.toCancel) {
    if (c.reason === 'off_pattern') touched.add(c.appt.service_type as string)
  }
  for (const c of plan.toCreate) touched.add(c.service)
  for (const c of plan.toResize) touched.add(c.appt.service_type as string)
  for (const service of touched) {
    // Ninguna cita de este servicio está donde el plan dice.
    if ((plan.keptByService[service] ?? 0) === 0) return 'systematic'
  }
  return 'one_off'
}

/** ¿Hay algo que corregir? */
export function hasDrift(plan: AgendaSyncPlan): boolean {
  return plan.toCancel.length > 0 || plan.toCreate.length > 0 || plan.toResize.length > 0
}
