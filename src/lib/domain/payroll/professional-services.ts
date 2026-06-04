/**
 * Cálculo del pago de SERVICIOS PROFESIONALES por terapista — POR CANTIDAD.
 *
 * A las terapistas pagadas por servicios profesionales se les paga por **terapia
 * dada**, no por hora: cada terapia completada aporta su **tarifa de catálogo**
 * (`service_catalog.cost_usd`, por `service_type`) una sola vez. El pago es:
 *
 *     pago = Σ tarifa(service_type_de_cada_terapia_completada)
 *          = (cantidad de terapias) × (tarifa)        [agrupado por tipo de servicio]
 *
 * La **duración** de la cita NO interviene — de hecho ni siquiera es un parámetro
 * de esta función, así que por construcción el cálculo es por cantidad y nunca por
 * horas. Esto es lo que se verifica en `professional-services.test.ts`.
 *
 * Todo es puro y testeable sin Supabase: `createPayrollRun` solo le pasa las citas
 * completadas del mes y el mapa de tarifas.
 */

import { round2 } from './calculation'

/** Cita de terapia completada, reducida a lo que importa para el pago. */
export interface CompletedTherapyForPay {
  therapist_id: string | null
  service_type: string | null
  /** Terapia extra/sábado/cobertura — define qué va a SP para quien está en ambas planillas. */
  is_extra: boolean
}

export interface TherapyPayTotals {
  /** Pago por TODAS las terapias completadas, por terapista (id → USD). */
  all: Map<string, number>
  /** Pago solo por las terapias `is_extra`, por terapista (id → USD). */
  extra: Map<string, number>
  /** Cantidad de terapias completadas, por terapista (id → conteo). Informativo. */
  count: Map<string, number>
}

/**
 * Acumula el pago de servicios profesionales por terapista, sumando la tarifa de
 * cada terapia completada (una por cita). `costByService` mapea `service_type` →
 * tarifa por terapia (USD); un `service_type` ausente cuenta como tarifa 0.
 */
export function sumProfessionalServicesPay(
  therapies: CompletedTherapyForPay[],
  costByService: Map<string, number>,
): TherapyPayTotals {
  const all = new Map<string, number>()
  const extra = new Map<string, number>()
  const count = new Map<string, number>()

  for (const t of therapies) {
    if (!t.therapist_id) continue
    const rate = costByService.get(t.service_type ?? '') ?? 0
    all.set(t.therapist_id, round2((all.get(t.therapist_id) ?? 0) + rate))
    count.set(t.therapist_id, (count.get(t.therapist_id) ?? 0) + 1)
    if (t.is_extra) {
      extra.set(t.therapist_id, round2((extra.get(t.therapist_id) ?? 0) + rate))
    }
  }

  return { all, extra, count }
}

/**
 * Base de pago SP de un terapista, según pertenezca también a la planilla normal:
 *  - en ambas (`inNormalPayroll = true`) → solo sus terapias `is_extra`.
 *  - solo en SP (`inNormalPayroll = false`) → todas sus terapias completadas.
 */
export function professionalServicesBaseFor(
  therapistId: string,
  inNormalPayroll: boolean,
  totals: TherapyPayTotals,
): number {
  const base = inNormalPayroll
    ? totals.extra.get(therapistId) ?? 0
    : totals.all.get(therapistId) ?? 0
  return round2(base)
}
