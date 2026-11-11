'use server'

/**
 * agenda-plan-sync.ts — revisar y poner al día la agenda contra el plan.
 *
 * El plan dice qué terapias, qué días y a qué hora; las citas las crea el ciclo
 * del mes. Cuando se desalinean, el reporte llega siempre igual: "el plan está
 * bien, pero sale agendado en días que no le corresponden". Antes la única
 * salida era anular el ciclo y generarlo de nuevo (y un ciclo ya pagado ni
 * siquiera se podía editar).
 *
 * Tres entradas, la misma regla (`@/lib/domain/agenda-plan-sync`):
 *  - `previewMonthAgendaDrift`  — todos los ciclos de un mes, sin escribir.
 *  - `previewChildAgendaDrift`  — los ciclos vigentes de un niño (aviso en la ficha).
 *  - `applyAgendaPlanSync`      — pone al día los ciclos elegidos.
 *
 * Solo se toca la agenda FUTURA. El cobro la sigue con el mismo mecanismo que
 * al crear o mover una cita (`syncCycleChargeToAgenda`): un ciclo pendiente
 * ajusta su monto; uno pagado no se re-cobra, la diferencia va al mes siguiente.
 */

import { revalidatePath } from 'next/cache'
import { toZonedTime } from 'date-fns-tz'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { hasDrift, type DriftReason, type DriftSeverity } from '@/lib/domain/agenda-plan-sync'
import {
  applyCycleAgendaSync,
  buildCycleAgendaSync,
  type CycleAgendaSync,
} from '@/lib/domain/agenda-plan-sync-db'
import { isChildClosed, isChildPaused } from '@/lib/domain/intake-pipeline'
import { syncCycleChargeToAgenda } from './cycle-charge-sync'

const TZ = 'America/El_Salvador'

const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
  'contable',
]

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

export interface AgendaDriftLine {
  service: string
  startsAt: string
  /** Solo en las que se cancelan. */
  reason?: DriftReason
}

export interface AgendaDriftRow {
  cycleId: string
  childId: string
  familyId: string | null
  childName: string
  /** 'YYYY-MM' */
  periodMonth: string
  paymentStatus: 'pending' | 'paid'
  /** 'systematic' = horario viejo o terapia ajena · 'one_off' = diferencias sueltas. */
  severity: Exclude<DriftSeverity, 'none'>
  cancel: AgendaDriftLine[]
  create: AgendaDriftLine[]
  /** Citas que quedan en su día y hora pero cambian de duración. */
  resize: (AgendaDriftLine & { minutes: number })[]
  kept: number
}

export interface AgendaDriftProblem {
  childName: string
  error: string
}

interface CycleRow {
  id: string
  child_id: string
  period_month: string
  payment_status: 'pending' | 'paid'
}

interface ChildRow {
  id: string
  family_id: string | null
  full_name: string
  current_phase_code: string | null
  archived_at?: string | null
}

async function requireMgmt(): Promise<Result<{ userId: string }>> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!MGMT_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }
  return { ok: true, userId: ctx.appUser.id }
}

function currentMonthStartSV(now: Date): string {
  const sv = toZonedTime(now, TZ)
  return `${sv.getFullYear()}-${String(sv.getMonth() + 1).padStart(2, '0')}-01`
}

/** Un niño en pausa o con alta/retiro no tiene agenda que mantener. */
function isSchedulable(child: ChildRow | undefined): boolean {
  if (!child) return false
  if (child.archived_at) return false
  return !isChildPaused(child.current_phase_code) && !isChildClosed(child.current_phase_code)
}

function toRow(sync: CycleAgendaSync, cycle: CycleRow, child: ChildRow): AgendaDriftRow | null {
  if (!hasDrift(sync.plan) || sync.severity === 'none') return null
  return {
    cycleId: cycle.id,
    childId: cycle.child_id,
    familyId: child.family_id,
    childName: child.full_name,
    periodMonth: String(cycle.period_month).slice(0, 7),
    paymentStatus: cycle.payment_status,
    severity: sync.severity,
    cancel: sync.plan.toCancel.map((c) => ({
      service: c.appt.service_type ?? '',
      startsAt: c.appt.starts_at,
      reason: c.reason,
    })),
    create: sync.plan.toCreate.map((c) => ({ service: c.service, startsAt: c.starts_at })),
    resize: sync.plan.toResize.map((c) => ({
      service: c.appt.service_type ?? '',
      startsAt: c.appt.starts_at,
      minutes: Math.round(
        (new Date(c.ends_at).getTime() - new Date(c.appt.starts_at).getTime()) / 60_000,
      ),
    })),
    kept: sync.plan.kept,
  }
}

async function loadChildren(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, ChildRow>> {
  const map = new Map<string, ChildRow>()
  if (ids.length === 0) return map
  // select('*'): `archived_at` (mig 0166) puede no existir en un ambiente viejo.
  const { data } = await admin.from('children').select('*').in('id', ids)
  for (const c of (data ?? []) as unknown as ChildRow[]) map.set(c.id, c)
  return map
}

/** Corre `fn` sobre `items` de a `size` a la vez (un RPC por ciclo). */
async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return out
}

async function driftForCycles(
  cycles: CycleRow[],
  nowISO: string,
): Promise<{ rows: AgendaDriftRow[]; problems: AgendaDriftProblem[]; checked: number; inactive: number }> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const children = await loadChildren(admin, [...new Set(cycles.map((c) => c.child_id))])

  const schedulable = cycles.filter((c) => isSchedulable(children.get(c.child_id)))
  const rows: AgendaDriftRow[] = []
  const problems: AgendaDriftProblem[] = []

  const results = await inChunks(schedulable, 8, async (cycle) => ({
    cycle,
    built: await buildCycleAgendaSync(
      supabase,
      admin,
      { id: cycle.id, child_id: cycle.child_id, period_month: String(cycle.period_month) },
      nowISO,
    ),
  }))

  for (const { cycle, built } of results) {
    const child = children.get(cycle.child_id) as ChildRow
    if (!built.ok) {
      problems.push({ childName: child.full_name, error: built.error })
      continue
    }
    const row = toRow(built.sync, cycle, child)
    if (row) rows.push(row)
  }

  rows.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'systematic' ? -1 : 1) ||
      a.childName.localeCompare(b.childName, 'es') ||
      a.periodMonth.localeCompare(b.periodMonth),
  )
  return { rows, problems, checked: schedulable.length, inactive: cycles.length - schedulable.length }
}

/**
 * Lista, SIN tocar nada, los ciclos del mes cuya agenda futura no coincide con
 * el plan del niño.
 *
 * @param periodMonth 'YYYY-MM-01'
 */
export async function previewMonthAgendaDrift(periodMonth: string): Promise<
  Result<{
    rows: AgendaDriftRow[]
    problems: AgendaDriftProblem[]
    /** Ciclos revisados. */
    checked: number
    /** Ciclos de niños en pausa o con alta/retiro, que no se revisan. */
    inactive: number
  }>
> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth
  if (!/^\d{4}-\d{2}-01$/.test(periodMonth)) return { ok: false, error: 'Mes inválido.' }

  try {
    const admin = createAdminClient()
    const { data: cyclesRaw, error } = await admin
      .from('monthly_session_cycles')
      .select('id, child_id, period_month, payment_status')
      .eq('period_month', periodMonth)
      .eq('status', 'generated')
      .order('id', { ascending: true })
    if (error) return { ok: false, error: error.message }

    const res = await driftForCycles(
      (cyclesRaw ?? []) as unknown as CycleRow[],
      new Date().toISOString(),
    )
    return { ok: true, ...res }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al revisar el mes.' }
  }
}

/** Lo mismo para los ciclos vigentes (mes en curso en adelante) de un niño. */
export async function previewChildAgendaDrift(
  childId: string,
): Promise<Result<{ rows: AgendaDriftRow[] }>> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth

  try {
    const now = new Date()
    const admin = createAdminClient()
    const { data: cyclesRaw, error } = await admin
      .from('monthly_session_cycles')
      .select('id, child_id, period_month, payment_status')
      .eq('child_id', childId)
      .eq('status', 'generated')
      .gte('period_month', currentMonthStartSV(now))
      .order('period_month', { ascending: true })
    if (error) return { ok: false, error: error.message }

    const res = await driftForCycles((cyclesRaw ?? []) as unknown as CycleRow[], now.toISOString())
    return { ok: true, rows: res.rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al revisar la agenda.' }
  }
}

/**
 * Pone la agenda futura de los ciclos indicados igual al plan: cancela las
 * citas automáticas que el plan ya no respalda y crea las que faltan.
 *
 * El plan se recalcula acá, en el momento: nunca se confía en lo que traía la
 * previsualización del navegador, que puede tener minutos de vieja.
 */
export async function applyAgendaPlanSync(cycleIds: string[]): Promise<
  Result<{
    applied: number
    cancelled: number
    created: number
    resized: number
    failed: AgendaDriftProblem[]
  }>
> {
  const auth = await requireMgmt()
  if (!auth.ok) return auth
  const ids = [...new Set(cycleIds.filter(Boolean))]
  if (ids.length === 0) return { ok: false, error: 'No hay ciclos seleccionados.' }

  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const nowISO = new Date().toISOString()

    const { data: cyclesRaw, error } = await admin
      .from('monthly_session_cycles')
      .select('id, child_id, period_month, payment_status, treatment_plan_snapshot')
      .in('id', ids)
      .eq('status', 'generated')
    if (error) return { ok: false, error: error.message }
    const cycles = (cyclesRaw ?? []) as unknown as (CycleRow & {
      treatment_plan_snapshot: Record<string, unknown> | null
    })[]
    const children = await loadChildren(admin, [...new Set(cycles.map((c) => c.child_id))])

    let applied = 0
    let cancelled = 0
    let created = 0
    let resized = 0
    const failed: AgendaDriftProblem[] = []

    for (const cycle of cycles) {
      const child = children.get(cycle.child_id)
      const childName = child?.full_name ?? 'Niño/a'
      if (!isSchedulable(child)) {
        failed.push({
          childName,
          error: 'Está en pausa o con alta/retiro: no se le agenda. Reanudalo primero.',
        })
        continue
      }

      const built = await buildCycleAgendaSync(
        supabase,
        admin,
        { id: cycle.id, child_id: cycle.child_id, period_month: String(cycle.period_month) },
        nowISO,
      )
      if (!built.ok) {
        failed.push({ childName, error: built.error })
        continue
      }
      if (!hasDrift(built.sync.plan)) continue

      const res = await applyCycleAgendaSync(admin, built.sync, auth.userId)
      cancelled += res.cancelled
      created += res.created
      resized += res.resized
      if (res.error) {
        failed.push({ childName, error: res.error })
        continue
      }
      applied += 1

      // El snapshot del ciclo guarda una copia del horario (la usa el detalle de
      // pago). Si venía viejo —que es justo el caso que se está corrigiendo— se
      // refresca con el del plan.
      const { data: livePlan } = await admin
        .from('treatment_plans')
        .select('schedule_pattern_json')
        .eq('child_id', cycle.child_id)
        .eq('active', true)
        .maybeSingle()
      const schedule = (livePlan as { schedule_pattern_json?: unknown } | null)?.schedule_pattern_json
      if (schedule) {
        await admin
          .from('monthly_session_cycles')
          .update({
            treatment_plan_snapshot: {
              ...(cycle.treatment_plan_snapshot ?? {}),
              schedule_pattern_json: schedule,
            },
          })
          .eq('id', cycle.id)
      }

      // El cobro sigue a la agenda (nunca lanza).
      await syncCycleChargeToAgenda(cycle.child_id, [String(cycle.period_month).slice(0, 10)])
    }

    revalidatePath('/agenda')
    revalidatePath('/mi-dia')
    revalidatePath('/ninos')
    revalidatePath('/familias/[id]/children/[childId]', 'page')
    revalidatePath('/mis-ninos/[childId]', 'page')
    revalidatePath('/operacion/revisar-agenda')
    return { ok: true, applied, cancelled, created, resized, failed }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al sincronizar la agenda.' }
  }
}
