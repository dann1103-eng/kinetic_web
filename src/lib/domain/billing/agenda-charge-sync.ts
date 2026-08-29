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
import { hasSessionsOverride } from './manual-overrides'

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
  /**
   * Cita sacada de la agenda por una suspensión avisada (mig 0184). NO se cobra:
   * la familia avisó con anticipación que el niño/a no vendría. Distinto de una
   * cancelación tardía, que sí se cobra y se acredita el mes siguiente.
   */
  suspension_id?: string | null
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
    // Suspensión avisada: la familia avisó que no vendría. No se cobra.
    if (a.suspension_id) continue
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
  /** Servicios cuyo precio venía en cero y se tomó del catálogo. */
  backfilledPrices: { service: string; unitCost: number }[]
  /** Servicios cuya cantidad está fijada a mano: el emparejado no los toca. */
  overriddenServices: string[]
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
 *   - Una terapia del snapshot SIN precio (`unit_cost_usd` en 0) lo toma del
 *     catálogo. Sin esto, recalcular el monto desde el snapshot daría cero y
 *     borraría el cobro del mes.
 */
export function therapiesSyncedToAgenda(
  therapies: TreatmentPlanTherapyEntry[],
  counts: Map<string, number>,
  priceFor: (service: string) => number,
): AgendaSyncResult {
  let changed = false
  const unpricedServices: string[] = []
  const overriddenServices: string[] = []
  const backfilledPrices: { service: string; unitCost: number }[] = []

  const synced = therapies.map((t) => {
    if (t.active === false) return t

    // Precio: el snapshot de un ciclo es una copia del PLAN, y el plan ya no
    // guarda precios (se eligen del catálogo al cobrar). Muchos snapshots traen
    // `unit_cost_usd = 0` mientras el monto real vive solo en
    // `payment_amount_usd`. Recalcular desde ahí daría CERO, así que el precio
    // faltante se rellena del catálogo antes de tocar nada.
    let entry = t
    if (!(Number(t.unit_cost_usd) > 0)) {
      const price = priceFor(t.service)
      if (price > 0) {
        entry = { ...entry, unit_cost_usd: price }
        backfilledPrices.push({ service: t.service, unitCost: price })
        changed = true
      } else {
        unpricedServices.push(t.service)
      }
    }

    if (isMonthlyFlatEntry(t)) return entry

    // Cantidad fijada a mano: gana sobre la agenda hasta que alguien la suelte.
    // Sin esto, corregir el cobro no servía de nada — mover una cita del mes lo
    // revertía en silencio. Se reporta para que la revisión de cobros pueda
    // explicar por qué no está emparejando esta terapia.
    if (hasSessionsOverride(t)) {
      overriddenServices.push(t.service)
      return entry
    }

    const count = counts.get(t.service)
    if (count == null || count === Number(t.sessions_per_month)) return entry
    changed = true
    return { ...entry, sessions_per_month: count }
  })

  const known = new Set<string>(therapies.map((t) => t.service))
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

  return { therapies: synced, changed, unpricedServices, backfilledPrices, overriddenServices }
}

/**
 * ¿Hay algo que corregir en este ciclo?
 *
 * Son DOS desfases distintos y hay que mirar los dos:
 *
 *  1. el detalle contra la agenda (`therapiesChanged`) — se cobran 4 sesiones
 *     y hay 3 agendadas;
 *  2. el monto registrado (`payment_amount_usd`) contra lo que suma ese mismo
 *     detalle — el ciclo dice $258 mientras sus terapias suman $236.
 *
 * La revisión por mes solo miraba el primero, así que un ciclo cuyo detalle ya
 * cuadraba con la agenda pero cuyo monto había quedado viejo era invisible: no
 * aparecía en la lista y no había forma de emparejarlo desde la app. Es
 * justamente el caso que llega al PDF de detalle como un total que no coincide
 * con la suma de sus propias filas.
 */
export function needsChargeSync(input: {
  therapiesChanged: boolean
  currentAmount: number
  newAmount: number
}): boolean {
  if (input.therapiesChanged) return true
  return Math.abs(input.newAmount - input.currentAmount) >= 0.01
}
