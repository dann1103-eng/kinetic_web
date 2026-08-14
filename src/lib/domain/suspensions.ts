/**
 * suspensions.ts — suspensión avisada (mig 0184). Lógica pura.
 *
 * La familia avisa que el niño/a no vendrá entre dos fechas y volverá. Durante
 * ese período no se le agenda ni se le cobra, pero NO cambia su fase clínica: no
 * está en pausa terapéutica, está de viaje.
 *
 * El rango es de DÍAS locales (SV) e inclusivo en ambos extremos: "del 1 al 15"
 * incluye el 15 completo.
 */
import { toZonedTime } from 'date-fns-tz'

const TZ = 'America/El_Salvador'

export interface SuspensionWindow {
  starts_on: string // 'YYYY-MM-DD'
  ends_on: string // 'YYYY-MM-DD'
  status?: 'active' | 'reverted'
}

/** Fecha local (SV) de un instante, como 'YYYY-MM-DD'. */
export function localDateSV(iso: string): string {
  const d = toZonedTime(new Date(iso), TZ)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ¿La fecha 'YYYY-MM-DD' cae dentro del rango (inclusive)? */
export function dateWithin(date: string, window: SuspensionWindow): boolean {
  return date >= window.starts_on && date <= window.ends_on
}

/** ¿El instante cae dentro de alguna suspensión ACTIVA? */
export function isSuspended(iso: string, windows: SuspensionWindow[]): boolean {
  const date = localDateSV(iso)
  return windows.some((w) => w.status !== 'reverted' && dateWithin(date, w))
}

/** Solo las suspensiones activas. */
export function activeSuspensions<T extends SuspensionWindow>(windows: T[]): T[] {
  return windows.filter((w) => w.status !== 'reverted')
}

export interface DateRangeError {
  field: 'starts_on' | 'ends_on' | 'overlap'
  message: string
}

/**
 * Valida un rango nuevo contra los existentes. Dos suspensiones activas que se
 * pisan casi siempre son un doble registro del mismo viaje.
 */
export function validateSuspensionRange(
  startsOn: string,
  endsOn: string,
  existing: SuspensionWindow[],
): DateRangeError | null {
  if (!startsOn) return { field: 'starts_on', message: 'Indicá desde qué día no vendrá.' }
  if (!endsOn) return { field: 'ends_on', message: 'Indicá hasta qué día no vendrá.' }
  if (endsOn < startsOn) {
    return { field: 'ends_on', message: 'La fecha de regreso no puede ser anterior a la de salida.' }
  }
  const overlap = activeSuspensions(existing).find(
    (w) => startsOn <= w.ends_on && endsOn >= w.starts_on,
  )
  if (overlap) {
    return {
      field: 'overlap',
      message: `Ya hay una suspensión registrada del ${overlap.starts_on} al ${overlap.ends_on}. Revertí esa antes de registrar otra.`,
    }
  }
  return null
}

/** Meses ('YYYY-MM-01') que toca un rango, para re-sincronizar sus ciclos. */
export function monthsInRange(startsOn: string, endsOn: string): string[] {
  const months: string[] = []
  const [sy, sm] = startsOn.slice(0, 7).split('-').map(Number)
  const [ey, em] = endsOn.slice(0, 7).split('-').map(Number)
  let y = sy
  let m = sm
  // Tope defensivo: un rango absurdo no debe colgar el bucle.
  while ((y < ey || (y === ey && m <= em)) && months.length < 36) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return months
}

/** Etiqueta legible del rango: "del 8 al 22 de agosto de 2026". */
export function suspensionRangeLabel(startsOn: string, endsOn: string): string {
  const fmt = (d: string, withMonth: boolean) => {
    const date = new Date(`${d}T12:00:00`)
    return date.toLocaleDateString('es-SV', {
      day: 'numeric',
      ...(withMonth ? { month: 'long', year: 'numeric' } : {}),
    })
  }
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7)
  return sameMonth
    ? `del ${fmt(startsOn, false)} al ${fmt(endsOn, true)}`
    : `del ${fmt(startsOn, true)} al ${fmt(endsOn, true)}`
}
