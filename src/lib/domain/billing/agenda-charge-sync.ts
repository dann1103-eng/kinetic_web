/**
 * agenda-charge-sync.ts — "La agenda manda, la facturación lee".
 *
 * Cuando alguien agenda (o borra) una terapia de un mes que YA tiene ciclo
 * generado, el cobro del ciclo se re-sincroniza con la agenda: la terapia extra
 * que la familia pidió se cobra sola, sin que nadie tenga que acordarse de
 * editar el ciclo a mano.
 *
 * Antes esto no pasaba: `payment_amount_usd` se congelaba al generar el ciclo y
 * ninguna operación sobre las citas lo volvía a tocar, así que el detalle de
 * pago mostraba la cita nueva en el calendario pero cobraba el monto viejo.
 *
 * Funciones puras (sin Supabase). El pegamento con la BD vive en
 * `src/app/actions/cycle-charge-sync.ts`.
 */
import { toZonedTime } from 'date-fns-tz'
import type { TreatmentPlanTherapyEntry } from '@/types/db'
import { isMonthlyFlatEntry, isMorningProgramService } from './monthly-flat'

const TZ = 'America/El_Salvador'

/**
 * Estados que NO cuentan para el cobro:
 *   - `rescheduled`: lápida de una cita movida o regenerada — la vigente es otra
 *     fila. Contarla duplicaría. (`cancelCycleAgenda` también usa este estado.)
 *   - `replacement`: reposición de una falta YA cobrada en su propio mes
 *     (mig 0155). Cobrarla sería cobrar dos veces la misma sesión.
 *
 * Todo lo demás cuenta, incluidas `no_show` / `late_cancel` / `cancelled`: la
 * sesión perdida se cobra este mes y se acredita el siguiente vía rollover
 * (`getCycleRolloverPreview`). Descontarla acá la acreditaría dos veces.
 */
export const CHARGE_EXCLUDED_STATUSES = ['rescheduled', 'replacement']

export interface ChargeableAppt {
  service_type: string | null
  status: string
  event_type?: string | null
}

/** Mes del ciclo ('YYYY-MM-01') al que pertenece un instante, en hora SV. */
export function periodMonthOfSV(iso: string): string {
  const local = toZonedTime(new Date(iso), TZ)
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Sesiones cobrables por servicio según la agenda del mes. Los programas
 * matutinos se excluyen: son mensualidad fija, su cantidad de citas no cambia
 * el cobro (mig 0147).
 */
export function billableSessionCounts(appointments: ChargeableAppt[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of appointments) {
    if (a.event_type != null && a.event_type !== 'terapia') continue
    if (CHARGE_EXCLUDED_STATUSES.includes(a.status)) continue
    const svc = a.service_type
    if (!svc || isMorningProgramService(svc)) continue
    counts.set(svc, (counts.get(svc) ?? 0) + 1)
  }
  return counts
}

export interface AgendaSyncResult {
  therapies: TreatmentPlanTherapyEntry[]
  changed: boolean
  /** Servicios agendados que no se pudieron cobrar por no tener precio conocido. */
  unpricedServices: string[]
}

/**
 * Devuelve `therapies_json` con `sessions_per_month` puesto al conteo real de la
 * agenda.
 *
 * Reglas deliberadas:
 *   - Solo se tocan servicios que TIENEN citas en el mes. Un servicio con 0 citas
 *     queda como está en vez de irse a cero: anular la agenda de un ciclo
 *     (`cancelCycleAgenda`) o borrar la última cita de una terapia no debe
 *     vaciar el cobro en silencio. Si el cobro queda por encima de la agenda, el
 *     PDF de detalle lo declara ("N sesiones cobradas aún no aparecen en el
 *     calendario").
 *   - Las mensualidades fijas nunca se tocan (se cobran por mes, no por sesión).
 *   - Un servicio agendado que no está en el plan se agrega si el catálogo le da
 *     precio; si no, se reporta en `unpricedServices` y no se cobra.
 */
export function therapiesSyncedToAgenda(
  therapies: TreatmentPlanTherapyEntry[],
  counts: Map<string, number>,
  priceFor: (service: string) => number,
): AgendaSyncResult {
  let changed = false

  const synced = therapies.map((t) => {
    if (t.active === false || isMonthlyFlatEntry(t)) return t
    const count = counts.get(t.service)
    if (count == null || count === Number(t.sessions_per_month)) return t
    changed = true
    return { ...t, sessions_per_month: count }
  })

  const known = new Set<string>(therapies.map((t) => t.service))
  const unpricedServices: string[] = []
  for (const [service, count] of counts) {
    if (known.has(service)) continue
    const price = priceFor(service)
    if (!(price > 0)) {
      unpricedServices.push(service)
      continue
    }
    changed = true
    synced.push({
      service: service as TreatmentPlanTherapyEntry['service'],
      active: true,
      sessions_per_month: count,
      unit_cost_usd: price,
      billing_mode: 'per_session',
    })
  }

  return { therapies: synced, changed, unpricedServices }
}
