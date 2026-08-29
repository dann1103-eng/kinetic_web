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
 * Por ahora cubre la CANTIDAD. El precio unitario llega en la entrega 3 con el
 * mismo patrón (`unit_cost_overridden`).
 */

import type { TreatmentPlanTherapyEntry } from '@/types/db'

/** Campos que la marca agrega al jsonb (no están en el tipo del plan). */
interface OverrideFields {
  sessions_overridden?: boolean
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

/**
 * Traslada las marcas (y los valores fijados) de un snapshot previo al nuevo.
 *
 * Es el respaldo para el refresco del snapshot al editar el plan, que trae
 * `sessions_per_month` **del plan** y borraría la corrección del mes. Mismo
 * patrón que `withPreservedPrices` para los precios.
 */
export function withPreservedOverrides(
  therapies: TreatmentPlanTherapyEntry[],
  prior: TreatmentPlanTherapyEntry[],
): TreatmentPlanTherapyEntry[] {
  if (prior.length === 0) return therapies
  const priorByService = new Map(prior.map((t) => [t.service, t as Entry]))

  return therapies.map((t) => {
    const before = priorByService.get(t.service)
    if (!before || before.sessions_overridden !== true) return t
    return withSessionsOverride(t, Number(before.sessions_per_month))
  })
}
