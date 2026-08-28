/**
 * Rango de fechas que un calendario está mostrando, según la vista y la fecha
 * en la que está parado.
 *
 * Nació de un bug de exportación: el botón "Exportar PDF" del panel del niño
 * mandaba TODOS los eventos cargados, y esos son dos cosas distintas — las
 * celdas del mes en curso MÁS las próximas 14 días. Exportando en agosto salían
 * citas de septiembre, así que el PDF decía "5 citas" donde el dashboard decía
 * 3. Lo que se exporta tiene que ser lo que se está viendo.
 */

export type CalendarView = 'month' | 'week' | 'day' | string

export interface DateRange {
  /** Inclusivo. */
  start: Date
  /** Exclusivo. */
  end: Date
}

/** Lunes de la semana de `d` (la semana de Kinetic empieza el lunes). */
function startOfMondayWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // getDay(): 0 = domingo. El lunes anterior está a (day + 6) % 7 días atrás.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}

/**
 * Ventana visible del calendario. Se calcula en hora local del navegador, que es
 * la misma con la que se pintan los eventos (`new Date(iso)`), así que un evento
 * cae dentro del rango exactamente cuando se ve en la grilla.
 *
 * En vista mensual devuelve el MES calendario, no las semanas completas que
 * dibuja react-big-calendar: los días de relleno del mes siguiente pertenecen a
 * otro período y no deben viajar en el PDF del mes.
 */
export function visibleRange(view: CalendarView, date: Date): DateRange {
  if (view === 'day') {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }
  if (view === 'week') {
    const start = startOfMondayWeek(date)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start, end }
}

/** Filtra por hora de inicio dentro de la ventana visible. */
export function withinVisibleRange<T extends { start: Date }>(
  events: T[],
  view: CalendarView,
  date: Date,
): T[] {
  const { start, end } = visibleRange(view, date)
  return events.filter((e) => e.start >= start && e.start < end)
}
