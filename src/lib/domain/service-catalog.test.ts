import { describe, it, expect } from 'vitest'
import {
  slugifyCatalogCode,
  categoryFieldRules,
  nextSortOrder,
} from './service-catalog'
import type { ServiceCatalogItem } from '@/types/db'

describe('slugifyCatalogCode', () => {
  it('baja a minúsculas y une con guion bajo', () => {
    expect(slugifyCatalogCode('Evaluacion de lenguaje')).toBe('evaluacion_de_lenguaje')
  })

  it('quita acentos y eñes', () => {
    expect(slugifyCatalogCode('Evaluación del niño')).toBe('evaluacion_del_nino')
  })

  it('colapsa puntuación y espacios repetidos en un solo guion bajo', () => {
    expect(slugifyCatalogCode('ADOS-2  (Autismo)')).toBe('ados_2_autismo')
  })

  it('recorta guiones bajos de los extremos', () => {
    expect(slugifyCatalogCode('  ¡Test!  ')).toBe('test')
  })

  it('devuelve cadena vacía si no queda nada utilizable', () => {
    expect(slugifyCatalogCode('¿¡---!?')).toBe('')
    expect(slugifyCatalogCode('')).toBe('')
  })

  it('siempre produce algo que pasa la validación del servidor', () => {
    const nombres = [
      'Evaluación ADI-R',
      'WISC-IV / WPPSI',
      'Uniforme (talla 4)',
      'Matrícula 2027',
    ]
    for (const n of nombres) {
      expect(slugifyCatalogCode(n)).toMatch(/^[a-z0-9_]+$/)
    }
  })
})

describe('categoryFieldRules', () => {
  it('terapia individual pide tipo de terapia y nada más', () => {
    expect(categoryFieldRules('terapia_individual')).toEqual({
      needsProgram: false,
      needsServiceType: true,
      allowsProration: false,
    })
  })

  it('mensualidad exige programa y días por semana', () => {
    expect(categoryFieldRules('mensualidad').needsProgram).toBe(true)
  })

  it('matrícula y material didáctico permiten prorrateo por mes', () => {
    expect(categoryFieldRules('matricula').allowsProration).toBe(true)
    expect(categoryFieldRules('material_didactico').allowsProration).toBe(true)
  })

  it('las evaluaciones no piden ningún campo extra', () => {
    expect(categoryFieldRules('evaluacion')).toEqual({
      needsProgram: false,
      needsServiceType: false,
      allowsProration: false,
    })
    expect(categoryFieldRules('evaluacion_dx_tea').needsProgram).toBe(false)
    expect(categoryFieldRules('evaluacion_psicologica').allowsProration).toBe(false)
  })
})

describe('nextSortOrder', () => {
  const items = [
    { category: 'evaluacion', sort_order: 10, active: true },
    { category: 'evaluacion', sort_order: 25, active: true },
    { category: 'uniforme', sort_order: 90, active: true },
  ] as unknown as ServiceCatalogItem[]

  it('deja el artículo nuevo al final de su categoría', () => {
    expect(nextSortOrder(items, 'evaluacion')).toBe(26)
  })

  it('no mezcla el orden de otras categorías', () => {
    expect(nextSortOrder(items, 'uniforme')).toBe(91)
  })

  it('arranca en 0 si la categoría está vacía', () => {
    expect(nextSortOrder(items, 'asesoria')).toBe(0)
  })

  it('cuenta también los inactivos, que ya ocupan un lugar', () => {
    const conInactivo = [
      { category: 'asesoria', sort_order: 40, active: false },
    ] as unknown as ServiceCatalogItem[]
    expect(nextSortOrder(conInactivo, 'asesoria')).toBe(41)
  })
})
