/**
 * Valores del cobro que una persona fijó a mano.
 *
 * El cobro de un mes se ajusta solo por dos caminos: el sync con la agenda
 * (`therapiesSyncedToAgenda`, que corre cada vez que se toca una cita del mes) y
 * el refresco del snapshot al editar el plan (`upsertTreatmentPlan`). Los dos son
 * correctos como default y los dos **pisan** cualquier corrección manual.
 *
 * Sin una forma de distinguir "lo puso una persona" de "quedó viejo", corregir
 * una cantidad no sirve de nada: vuelve sola al primer cambio de agenda, sin
 * aviso. La marca es esa distinción, y por decisión del usuario **gana** hasta
 * que alguien la limpie explícitamente.
 *
 * Vive en el jsonb del snapshot del ciclo, así que no lleva migración.
 *
 * Cubre la CANTIDAD y el PRECIO UNITARIO, cada uno con su marca. Son
 * independientes: se puede fijar la cantidad y dejar el precio en automático.
 */

import type { TreatmentPlanTherapyEntry } from '@/types/db'

/** Campos que la marca agrega al jsonb (no están en el tipo del plan). */
interface OverrideFields {
  sessions_overridden?: boolean
  unit_cost_overridden?: boolean
}

type Entry = TreatmentPlanTherapyEntry & OverrideFields

export function hasSessionsOverride(entry: TreatmentPlanTherapyEntry): boolean {
  return (entry as Entry).sessions_overridden === true
}

/** Fija la cantidad de ese mes y la marca como puesta a mano. */
export function withSessionsOverride(
  entry: TreatmentPlanTherapyEntry,
  sessionsPerMonth: number,
): TreatmentPlanTherapyEntry {
  return {
    ...entry,
    sessions_per_month: sessionsPerMonth,
    sessions_overridden: true,
  } as TreatmentPlanTherapyEntry
}

/**
 * Suelta la cantidad: vuelve a ser candidata al ajuste automático.
 *
 * NO adivina el conteo de la agenda — eso lo hace el sync la próxima vez que
 * corra. Acá solo se quita la marca.
 */
export function clearSessionsOverride(
  entry: TreatmentPlanTherapyEntry,
): TreatmentPlanTherapyEntry {
  const { sessions_overridden: _ignored, ...rest } = entry as Entry
  void _ignored
  return rest as TreatmentPlanTherapyEntry
}

export function hasUnitCostOverride(entry: TreatmentPlanTherapyEntry): boolean {
  return (entry as Entry).unit_cost_overridden === true
}

/**
 * Fija el precio de ese mes y lo marca como puesto a mano.
 *
 * Acepta CERO a propósito: una terapia becada tiene precio 0, y sin la marca el
 * respaldo del catálogo (que rellena todo lo que venga en cero) la volvería a
 * cobrar sola.
 */
export function withUnitCostOverride(
  entry: TreatmentPlanTherapyEntry,
  unitCostUsd: number,
): TreatmentPlanTherapyEntry {
  return {
    ...entry,
    unit_cost_usd: unitCostUsd,
    unit_cost_overridden: true,
  } as TreatmentPlanTherapyEntry
}

/** Suelta el precio: vuelve a mandar el catálogo. */
export function clearUnitCostOverride(
  entry: TreatmentPlanTherapyEntry,
): TreatmentPlanTherapyEntry {
  const { unit_cost_overridden: _ignored, ...rest } = entry as Entry
  void _ignored
  return rest as TreatmentPlanTherapyEntry
}

/**
 * Traslada las marcas (y los valores fijados) de un snapshot previo al nuevo.
 *
 * Es el respaldo para el refresco del snapshot al editar el plan, que trae la
 * cantidad **del plan** y un precio en cero que el catálogo rellena — los dos
 * borrarían la corrección del mes. Mismo patrón que `withPreservedPrices`.
 */
export function withPreservedOverrides(
  therapies: TreatmentPlanTherapyEntry[],
  prior: TreatmentPlanTherapyEntry[],
): TreatmentPlanTherapyEntry[] {
  if (prior.length === 0) return therapies
  const priorByService = new Map(prior.map((t) => [t.service, t as Entry]))

  return therapies.map((t) => {
    const before = priorByService.get(t.service)
    if (!before) return t
    let out = t
    if (before.sessions_overridden === true) {
      out = withSessionsOverride(out, Number(before.sessions_per_month))
    }
    if (before.unit_cost_overridden === true) {
      out = withUnitCostOverride(out, Number(before.unit_cost_usd))
    }
    return out
  })
}
