/**
 * Formateo de INSTANTES (timestamptz / ISO) en hora de El Salvador.
 *
 * CRÍTICO: estos helpers SIEMPRE pasan `timeZone: 'America/El_Salvador'`. Sin eso,
 * `new Date(iso).toLocaleString('es-SV', …)` formatea en la zona del runtime —
 * que en el **server** (Vercel) es **UTC** → las horas salían +6 (una cita de las
 * 3:00 p.m. se veía como 9:00 p.m.). Con `timeZone` el resultado es correcto tanto
 * en server como en cliente, y server/cliente coinciden (sin parpadeo de hidratación).
 *
 * Usar SIEMPRE estos helpers para mostrar la hora de una cita/sesión, en lugar de
 * `toLocaleString`/`toLocaleTimeString` sin `timeZone`.
 *
 * OJO: son para INSTANTES (timestamptz con hora). Para columnas de solo fecha
 * (DATE, "YYYY-MM-DD") NO usar esto — ahí no hay hora y aplicar la zona correría
 * el día. Para esos casos ver `formatDateEs` en `@/lib/domain/dates`.
 */

import { APP_TZ } from '@/lib/domain/dates'

/** Ej: "lun, 9 jun, 3:00 p. m." */
export function formatSvDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: APP_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

/** Ej: "3:00 p. m." */
export function formatSvTime(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: APP_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

/** Ej: "9 de junio de 2026" */
export function formatSvDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: APP_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}
