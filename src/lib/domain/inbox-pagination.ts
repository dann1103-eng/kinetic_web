import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'

/**
 * Zona horaria oficial del CRM. Usar para todas las decisiones de "qué día
 * calendario es un mensaje" — evita que un mensaje a las 11pm UTC aparezca
 * como del día siguiente para usuarios en El Salvador (UTC-6).
 */
export const APP_TZ = 'America/El_Salvador'

/** Tope de mensajes que se cargan en una sola petición de día. */
export const DAY_PAGE_CAP = 200

/**
 * Para un día calendario `YYYY-MM-DD` en hora de El Salvador, devuelve
 * los límites en UTC ISO para usar en queries de Postgres.
 */
export function dayBoundsLocal(dayKey: string): { startUtcIso: string; endUtcIso: string } {
  const startLocal = `${dayKey}T00:00:00.000`
  const endLocal = `${dayKey}T23:59:59.999`
  const startUtc = fromZonedTime(startLocal, APP_TZ)
  const endUtc = fromZonedTime(endLocal, APP_TZ)
  return { startUtcIso: startUtc.toISOString(), endUtcIso: endUtc.toISOString() }
}

/** Convierte un timestamp UTC ISO a su día calendario local (`YYYY-MM-DD`). */
export function dayKeyFromIso(iso: string): string {
  const local = toZonedTime(new Date(iso), APP_TZ)
  return format(local, 'yyyy-MM-dd')
}

/** Devuelve `YYYY-MM-DD` del día anterior a `dayKey`. */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  // Operamos en UTC para evitar saltos de DST/zona horaria — el cómputo de
  // "día anterior" es puramente calendárico.
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return format(dt, 'yyyy-MM-dd')
}
