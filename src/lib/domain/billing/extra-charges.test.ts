import { describe, it, expect } from 'vitest'
import { extraChargesTotal, normalizeExtraCharges } from './extra-charges'

describe('extraChargesTotal', () => {
  it('sin líneas suma cero', () => {
    expect(extraChargesTotal([])).toBe(0)
  })

  it('suma cantidad por precio', () => {
    expect(
      extraChargesTotal([
        { description: 'Materiales', quantity: 2, unit_price: 7.5 },
        { description: 'Evaluación', quantity: 1, unit_price: 40 },
      ]),
    ).toBe(55)
  })

  it('admite un monto negativo como descuento puntual', () => {
    expect(
      extraChargesTotal([{ description: 'Ajuste acordado', quantity: 1, unit_price: -10 }]),
    ).toBe(-10)
  })
})

describe('normalizeExtraCharges', () => {
  it('la columna sin migrar (undefined) da lista vacía, no error', () => {
    // El deploy de Vercel sale antes que la migración manual: si esto tirara,
    // se caería el detalle de pago de todos los ciclos hasta aplicarla.
    expect(normalizeExtraCharges(undefined)).toEqual([])
    expect(normalizeExtraCharges(null)).toEqual([])
  })

  it('descarta filas sin descripción', () => {
    expect(
      normalizeExtraCharges([
        { description: '  ', quantity: 1, unit_price: 5 },
        { description: 'Materiales', quantity: 1, unit_price: 5 },
      ]),
    ).toEqual([{ description: 'Materiales', quantity: 1, unit_price: 5 }])
  })

  it('normaliza números que llegan como texto', () => {
    expect(normalizeExtraCharges([{ description: 'X', quantity: '2', unit_price: '7.5' }])).toEqual([
      { description: 'X', quantity: 2, unit_price: 7.5 },
    ])
  })

  it('descarta lo que no es una lista', () => {
    expect(normalizeExtraCharges('[]')).toEqual([])
    expect(normalizeExtraCharges({ description: 'X' })).toEqual([])
  })
})
