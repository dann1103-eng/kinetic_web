import { describe, it, expect } from 'vitest'
import {
  hasSessionsOverride,
  withSessionsOverride,
  clearSessionsOverride,
  withPreservedOverrides,
  hasUnitCostOverride,
  withUnitCostOverride,
  clearUnitCostOverride,
} from './manual-overrides'
import type { TreatmentPlanTherapyEntry } from '@/types/db'

const entry = (over: Partial<TreatmentPlanTherapyEntry> = {}) =>
  ({
    service: 'lenguaje',
    active: true,
    sessions_per_month: 4,
    unit_cost_usd: 22,
    billing_mode: 'per_session',
    ...over,
  }) as TreatmentPlanTherapyEntry

describe('hasSessionsOverride', () => {
  it('una entrada normal no está marcada', () => {
    expect(hasSessionsOverride(entry())).toBe(false)
  })

  it('reconoce la marca', () => {
    expect(hasSessionsOverride(withSessionsOverride(entry(), 3))).toBe(true)
  })
})

describe('withSessionsOverride', () => {
  it('fija la cantidad y deja la marca', () => {
    const res = withSessionsOverride(entry(), 3)

    expect(res.sessions_per_month).toBe(3)
    expect(hasSessionsOverride(res)).toBe(true)
  })

  it('no muta la entrada original', () => {
    const original = entry()
    withSessionsOverride(original, 3)

    expect(original.sessions_per_month).toBe(4)
    expect(hasSessionsOverride(original)).toBe(false)
  })
})

describe('clearSessionsOverride', () => {
  it('quita la marca y deja la cantidad como estaba', () => {
    const fijada = withSessionsOverride(entry(), 3)
    const res = clearSessionsOverride(fijada)

    expect(hasSessionsOverride(res)).toBe(false)
    // Volver a automático no adivina el conteo de la agenda: eso lo hace el
    // sync la próxima vez que corra. Acá solo se suelta la cantidad.
    expect(res.sessions_per_month).toBe(3)
  })
})

describe('withPreservedOverrides', () => {
  it('traslada marca y cantidad de la entrada previa', () => {
    // Editar el plan trae `sessions_per_month` del PLAN (8); la corrección del
    // mes (3) tiene que ganar, o editar el plan la borraría en silencio.
    const previas = [withSessionsOverride(entry(), 3)]
    const nuevas = [entry({ sessions_per_month: 8 })]

    const res = withPreservedOverrides(nuevas, previas)

    expect(res[0].sessions_per_month).toBe(3)
    expect(hasSessionsOverride(res[0])).toBe(true)
  })

  it('no toca una terapia que no estaba marcada', () => {
    const res = withPreservedOverrides([entry({ sessions_per_month: 8 })], [entry()])

    expect(res[0].sessions_per_month).toBe(8)
    expect(hasSessionsOverride(res[0])).toBe(false)
  })

  it('no inventa marcas para una terapia que no estaba en el snapshot previo', () => {
    const res = withPreservedOverrides([entry({ service: 'sensorial' })], [
      withSessionsOverride(entry(), 3),
    ])

    expect(res[0].service).toBe('sensorial')
    expect(hasSessionsOverride(res[0])).toBe(false)
    expect(res[0].sessions_per_month).toBe(4)
  })

  it('preserva por servicio cuando hay varias terapias', () => {
    const previas = [withSessionsOverride(entry(), 3), entry({ service: 'sensorial' })]
    const nuevas = [
      entry({ sessions_per_month: 8 }),
      entry({ service: 'sensorial', sessions_per_month: 6 }),
    ]

    const res = withPreservedOverrides(nuevas, previas)

    expect(res[0].sessions_per_month).toBe(3)
    expect(res[1].sessions_per_month).toBe(6)
  })

  it('sin entradas previas devuelve las nuevas tal cual', () => {
    const nuevas = [entry({ sessions_per_month: 8 })]

    expect(withPreservedOverrides(nuevas, [])).toEqual(nuevas)
  })
})

describe('precio fijado a mano', () => {
  it('una entrada normal no tiene el precio marcado', () => {
    expect(hasUnitCostOverride(entry())).toBe(false)
  })

  it('fija el precio y deja la marca', () => {
    const res = withUnitCostOverride(entry(), 18)

    expect(res.unit_cost_usd).toBe(18)
    expect(hasUnitCostOverride(res)).toBe(true)
  })

  it('acepta un precio en cero puesto a propósito', () => {
    // Una terapia becada. Sin la marca, el respaldo del catálogo la volvería a
    // cobrar sola.
    const res = withUnitCostOverride(entry(), 0)

    expect(res.unit_cost_usd).toBe(0)
    expect(hasUnitCostOverride(res)).toBe(true)
  })

  it('clearUnitCostOverride quita solo esa marca', () => {
    const fijada = withUnitCostOverride(withSessionsOverride(entry(), 3), 18)
    const res = clearUnitCostOverride(fijada)

    expect(hasUnitCostOverride(res)).toBe(false)
    expect(hasSessionsOverride(res)).toBe(true)
  })

  it('withPreservedOverrides traslada el precio fijado', () => {
    // Editar el plan trae precio 0 (el plan ya no guarda precios) y el catálogo
    // lo rellena a 22, pisando el acuerdo de 18 de ese mes.
    const previas = [withUnitCostOverride(entry(), 18)]
    const nuevas = [entry({ unit_cost_usd: 22 })]

    const res = withPreservedOverrides(nuevas, previas)

    expect(res[0].unit_cost_usd).toBe(18)
    expect(hasUnitCostOverride(res[0])).toBe(true)
  })

  it('withPreservedOverrides traslada las dos marcas juntas', () => {
    const previas = [withUnitCostOverride(withSessionsOverride(entry(), 3), 18)]
    const nuevas = [entry({ sessions_per_month: 8, unit_cost_usd: 22 })]

    const res = withPreservedOverrides(nuevas, previas)

    expect(res[0].sessions_per_month).toBe(3)
    expect(res[0].unit_cost_usd).toBe(18)
  })
})
