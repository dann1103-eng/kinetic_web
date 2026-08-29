/**
 * catalog-price.ts — precio de catálogo de un servicio, y respaldo de precios
 * para snapshots que vienen sin ellos.
 *
 * POR QUÉ EXISTE: `treatment_plan_snapshot` es una copia del **plan**, y el plan
 * ya no guarda precios (se eligen del catálogo al cobrar). Muchos snapshots
 * traen `unit_cost_usd = 0` mientras el monto real vive solo en
 * `payment_amount_usd`. Cualquier cosa que recalcule desde el snapshot —el monto
 * del ciclo, las líneas de la factura— da CERO si no rellena el precio primero.
 * Eso emitió facturas en $0 durante meses.
 *
 * Funciones puras. Espejo de `catalogPriceFor` en `NewMonthlyCycleModal`.
 */
import type { ServiceCatalogItem, TreatmentPlanTherapyEntry } from '@/types/db'
import { isMorningProgramService } from './monthly-flat'
import { hasUnitCostOverride } from './manual-overrides'

export interface CatalogPriceOptions {
  /** El niño va a programa matutino: aplica el precio BK de la terapia. */
  isMorningChild?: boolean
  /** Variante de días/semana, para elegir la mensualidad exacta. */
  daysPerWeek?: number | null
}

/** Precio de catálogo de un servicio. 0 = sin precio activo. */
export function catalogPriceFor(
  catalog: ServiceCatalogItem[],
  service: string,
  opts: CatalogPriceOptions = {},
): number {
  const individual = catalog.find(
    (c) => c.active && c.category === 'terapia_individual' && c.service_type === service,
  )
  if (individual) {
    if (opts.isMorningChild && individual.unit_price_bk_usd != null) {
      return Number(individual.unit_price_bk_usd)
    }
    return Number(individual.unit_price_usd ?? 0)
  }

  if (isMorningProgramService(service)) {
    const variants = catalog.filter(
      (c) => c.active && c.category === 'mensualidad' && c.morning_program === service,
    )
    const exact = opts.daysPerWeek
      ? variants.find((c) => c.days_per_week === opts.daysPerWeek)
      : undefined
    const chosen =
      exact ?? [...variants].sort((a, b) => (b.days_per_week ?? 0) - (a.days_per_week ?? 0))[0]
    if (chosen) return Number(chosen.unit_price_usd ?? 0)
  }
  return 0
}

/**
 * Rellena con el precio que ya tenía el snapshot lo que siga sin precio.
 *
 * El plan de tratamiento NO guarda precios: se eligen del catálogo al cobrar y
 * quedan en el snapshot del ciclo. Copiar el plan encima del snapshot borra ese
 * precio (lo deja en 0), y con él el cobro del mes. Pasó en prod: editar el plan
 * de un niño dejó su detalle de pago en "$0.00" por sesión.
 *
 * ORDEN DE PRIORIDAD (ver `upsertTreatmentPlan`): primero el CATÁLOGO, que es la
 * fuente de precios — todas las terapias son de 30 min y el catálogo cotiza por
 * media hora. Esto es el respaldo, para un servicio que el catálogo no tenga
 * cotizado. Aplicarlo al revés dejaba precios viejos pegados: un plan que parte
 * una sesión de 60 min en dos de 30 conservaba el precio de la de 60.
 */
export function withPreservedPrices(
  next: TreatmentPlanTherapyEntry[],
  prior: TreatmentPlanTherapyEntry[],
): TreatmentPlanTherapyEntry[] {
  const priorPriceBy = new Map<string, number>()
  for (const t of prior) {
    const price = Number(t.unit_cost_usd)
    if (price > 0) priorPriceBy.set(t.service, price)
  }
  return next.map((t) => {
    if (Number(t.unit_cost_usd) > 0) return t
    if (hasUnitCostOverride(t)) return t
    const prev = priorPriceBy.get(t.service)
    return prev ? { ...t, unit_cost_usd: prev } : t
  })
}

export interface PriceBackfillResult {
  therapies: TreatmentPlanTherapyEntry[]
  /** Terapias cuyo precio venía en cero y se tomó del catálogo. */
  filled: { service: string; unitCost: number }[]
  /** Terapias que siguen sin precio: el catálogo tampoco lo tiene. */
  stillUnpriced: string[]
}

/**
 * Devuelve las terapias con el precio rellenado del catálogo donde venía en
 * cero. No toca las que ya traen precio (un precio editado al cobrar manda sobre
 * el de lista).
 */
export function withCatalogPrices(
  therapies: TreatmentPlanTherapyEntry[],
  catalog: ServiceCatalogItem[],
): PriceBackfillResult {
  const isMorningChild = therapies.some(
    (t) => t.active !== false && isMorningProgramService(t.service),
  )
  const filled: { service: string; unitCost: number }[] = []
  const stillUnpriced: string[] = []

  const out = therapies.map((t) => {
    if (t.active === false || Number(t.unit_cost_usd) > 0) return t
    // Precio fijado a mano: se respeta aunque sea CERO. Una terapia becada tiene
    // precio 0 legítimo, y rellenarla del catálogo la volvería a cobrar sola.
    if (hasUnitCostOverride(t)) return t
    const price = catalogPriceFor(catalog, t.service, {
      isMorningChild,
      daysPerWeek: t.days_per_week,
    })
    if (!(price > 0)) {
      stillUnpriced.push(t.service)
      return t
    }
    filled.push({ service: t.service, unitCost: price })
    return { ...t, unit_cost_usd: price }
  })

  return { therapies: out, filled, stillUnpriced }
}
