/**
 * Carga de la BD todo lo que `buildCycleDetail` necesita para un ciclo.
 *
 * Vivía dentro de la ruta del PDF. Se extrajo para que el documento que se le
 * manda a la familia y la pantalla donde se revisa antes de mandarlo lean
 * exactamente lo mismo: dos armados paralelos del mismo detalle es justo cómo
 * nacieron los desfases de esta parte del sistema.
 *
 * Es solo lectura y no decide nada: la aritmética del cobro sigue siendo de
 * `buildCycleDetail`.
 */

import { fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  MonthlySessionCycle,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
} from '@/types/db'
import type { CycleDetailAppt } from './cycle-detail'

const TZ = 'America/El_Salvador'

export interface CycleDetailInput {
  cycle: MonthlySessionCycle
  childName: string
  /** 'YYYY-MM-01' */
  periodMonth: string
  therapies: TreatmentPlanTherapyEntry[]
  schedule: TreatmentPlanScheduleSlot[]
  appointments: CycleDetailAppt[]
}

/** `null` si el ciclo no existe. */
export async function loadCycleDetailInput(
  supabase: SupabaseClient<Database>,
  cycleId: string,
): Promise<CycleDetailInput | null> {
  const { data: cycleRaw } = await supabase
    .from('monthly_session_cycles')
    .select('*')
    .eq('id', cycleId)
    .maybeSingle()
  if (!cycleRaw) return null
  const cycle = cycleRaw as MonthlySessionCycle

  const { data: childRow } = await supabase
    .from('children')
    .select('full_name, preferred_name')
    .eq('id', cycle.child_id)
    .maybeSingle()
  const childName =
    (childRow as { full_name?: string } | null)?.full_name ?? 'Niño/a'

  // El snapshot del plan trae terapias y horario. Si no trae horario (snapshots
  // viejos), se cae al plan activo del niño.
  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
    schedule_pattern_json?: TreatmentPlanScheduleSlot[]
  }
  let schedule = snapshot.schedule_pattern_json ?? []
  if (schedule.length === 0) {
    const { data: planRow } = await supabase
      .from('treatment_plans')
      .select('schedule_pattern_json')
      .eq('child_id', cycle.child_id)
      .eq('active', true)
      .maybeSingle()
    schedule = ((planRow as { schedule_pattern_json?: TreatmentPlanScheduleSlot[] } | null)
      ?.schedule_pattern_json ?? []) as TreatmentPlanScheduleSlot[]
  }

  const ym = String(cycle.period_month).slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString()
  const { data: apptsRaw } = await supabase
    .from('appointments')
    // select('*') a propósito: nombrar `suspension_id` haría fallar la consulta
    // entera si la migración 0184 todavía no se aplicó.
    .select('*')
    .eq('child_id', cycle.child_id)
    .in('event_type', ['terapia', 'programa_matutino'])
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at')

  return {
    cycle,
    childName,
    periodMonth: `${ym}-01`,
    therapies: snapshot.therapies_json ?? [],
    schedule,
    appointments: (apptsRaw ?? []) as CycleDetailAppt[],
  }
}
