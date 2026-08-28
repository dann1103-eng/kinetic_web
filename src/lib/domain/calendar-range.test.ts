import { describe, it, expect } from 'vitest'
import { visibleRange, withinVisibleRange } from './calendar-range'

/** Local, igual que `new Date(iso)` en el navegador al pintar el calendario. */
const at = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h, 30)

describe('visibleRange', () => {
  it('la vista mensual es el mes calendario, sin los días de relleno', () => {
    const { start, end } = visibleRange('month', at(2026, 8, 26))

    expect(start).toEqual(new Date(2026, 7, 1))
    expect(end).toEqual(new Date(2026, 8, 1))
  })

  it('la vista semanal arranca el lunes', () => {
    // El 26 de agosto de 2026 es miércoles; su lunes es el 24.
    const { start, end } = visibleRange('week', at(2026, 8, 26))

    expect(start).toEqual(new Date(2026, 7, 24))
    expect(end).toEqual(new Date(2026, 7, 31))
  })

  it('un lunes es su propio inicio de semana', () => {
    expect(visibleRange('week', at(2026, 8, 24)).start).toEqual(new Date(2026, 7, 24))
  })

  it('un domingo pertenece a la semana que arrancó el lunes anterior', () => {
    // Domingo 30 de agosto de 2026 → lunes 24.
    expect(visibleRange('week', at(2026, 8, 30)).start).toEqual(new Date(2026, 7, 24))
  })

  it('la vista diaria es un solo día', () => {
    const { start, end } = visibleRange('day', at(2026, 8, 26))

    expect(start).toEqual(new Date(2026, 7, 26))
    expect(end).toEqual(new Date(2026, 7, 27))
  })
})

describe('withinVisibleRange', () => {
  // Caso real: al exportar agosto salían 5 citas de Lenguaje porque las
  // "próximas 14 días" arrastraban las del 1 y el 8 de septiembre.
  const eventos = [
    { id: 'ago-11', start: at(2026, 8, 11) },
    { id: 'ago-18', start: at(2026, 8, 18) },
    { id: 'ago-25', start: at(2026, 8, 25) },
    { id: 'sep-01', start: at(2026, 9, 1) },
    { id: 'sep-08', start: at(2026, 9, 8) },
  ]

  it('exportar agosto deja fuera las citas de septiembre', () => {
    const ids = withinVisibleRange(eventos, 'month', at(2026, 8, 28)).map((e) => e.id)

    expect(ids).toEqual(['ago-11', 'ago-18', 'ago-25'])
  })

  it('parado en septiembre exporta las de septiembre', () => {
    const ids = withinVisibleRange(eventos, 'month', at(2026, 9, 3)).map((e) => e.id)

    expect(ids).toEqual(['sep-01', 'sep-08'])
  })

  it('en vista semanal exporta solo esa semana', () => {
    const ids = withinVisibleRange(eventos, 'week', at(2026, 8, 25)).map((e) => e.id)

    expect(ids).toEqual(['ago-25'])
  })

  it('el último día del mes entra y el primero del siguiente no', () => {
    const borde = [
      { id: 'ago-31', start: at(2026, 8, 31, 23) },
      { id: 'sep-01', start: at(2026, 9, 1, 0) },
    ]

    expect(withinVisibleRange(borde, 'month', at(2026, 8, 15)).map((e) => e.id)).toEqual(['ago-31'])
  })
})
