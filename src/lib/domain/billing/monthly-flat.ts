/**
 * monthly-flat.ts — Modalidad "mensualidad fija" de los programas matutinos.
 *
 * Los programas de la mañana (Blue Kids, Learning Kids, Aula Educativa) se
 * facturan como suscripción: los padres pagan un monto fijo al mes por asistir
 * todos los días establecidos, sin importar si el mes tiene 28 o 31 días.
 *
 * Regla de modalidad de una entrada del plan (`TreatmentPlanTherapyEntry`):
 *   - `billing_mode` explícito manda.
 *   - Sin `billing_mode`, los servicios matutinos son `monthly_flat` implícito
 *     (corrige los planes existentes sin re-guardarlos); el resto `per_session`.
 *
 * El espejo SQL de esta regla vive en la migración 0147
 * (`_kn_is_monthly_flat`). Si cambia acá, cambiarla allá también.
 */
import type { ServiceType, TreatmentPlanTherapyEntry } from '@/types/db'

export const MORNING_PROGRAM_SERVICES = [
  'blue_kids',
  'learning_kids',
  'aula_educativa',
] as const satisfies readonly ServiceType[]

export function isMorningProgramService(service: string): boolean {
  return (MORNING_PROGRAM_SERVICES as readonly string[]).includes(service)
}

type EntryLike = Pick<TreatmentPlanTherapyEntry, 'service'> &
  Partial<Pick<TreatmentPlanTherapyEntry, 'billing_mode'>>

/** ¿La entrada se cobra como mensualidad fija (1 × precio, sin cuota de citas)? */
export function isMonthlyFlatEntry(entry: EntryLike): boolean {
  if (entry.billing_mode) return entry.billing_mode === 'monthly_flat'
  return isMorningProgramService(entry.service)
}

/**
 * Monto mensual de una entrada del plan:
 *   - monthly_flat → mensualidad fija (`unit_cost_usd`), venga el mes que venga.
 *   - per_session  → sesiones × precio unitario.
 */
export function therapyLineAmount(
  entry: EntryLike & Pick<TreatmentPlanTherapyEntry, 'sessions_per_month' | 'unit_cost_usd'>,
): number {
  const unit = Number(entry.unit_cost_usd ?? 0)
  const amount = isMonthlyFlatEntry(entry)
    ? unit
    : Number(entry.sessions_per_month ?? 0) * unit
  return Math.round(amount * 100) / 100
}

/** Etiqueta de la variante: "3 días a la semana" (null si no hay variante). */
export function daysPerWeekLabel(daysPerWeek: number | null | undefined): string | null {
  if (!daysPerWeek || daysPerWeek <= 0) return null
  return `${daysPerWeek} día${daysPerWeek === 1 ? '' : 's'} a la semana`
}

type CoverageEntry = Pick<TreatmentPlanTherapyEntry, 'service' | 'active'> &
  Partial<Pick<TreatmentPlanTherapyEntry, 'therapist_id' | 'billing_mode'>>

/**
 * IDs de terapistas asignadas a las terapias activas del plan (sin duplicados).
 * Los programas matutinos no asignan terapista individual (los lleva el grupo),
 * así que su `therapist_id` ausente no cuenta.
 */
export function planTherapistIds(therapies: CoverageEntry[] | null | undefined): string[] {
  const ids = new Set<string>()
  for (const t of therapies ?? []) {
    if (t.active === false) continue
    if (t.therapist_id) ids.add(t.therapist_id)
  }
  return [...ids]
}

/**
 * ¿El plan tiene cobertura de terapistas suficiente para operar (generar ciclo,
 * salir en "mis niños")? Regla del modelo SIN terapista principal:
 *   - debe haber al menos una terapia activa, y
 *   - toda terapia activa NO matutina debe tener una terapista asignada
 *     (las matutinas se cubren por el grupo, no requieren terapista individual).
 */
export function planHasTherapistCoverage(therapies: CoverageEntry[] | null | undefined): boolean {
  const active = (therapies ?? []).filter((t) => t.active !== false)
  if (active.length === 0) return false
  return active.every((t) => isMorningProgramService(t.service) || !!t.therapist_id)
}
