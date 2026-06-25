import { describe, it, expect } from 'vitest'
import { calculateProfessionalServicesPayroll } from './calculation'

describe('calculateProfessionalServicesPayroll con bonos', () => {
  it('bruto = base + bonos y retención sobre el bruto', () => {
    const r = calculateProfessionalServicesPayroll({ baseUsd: 500, bonusUsd: 100 }, 0.1)
    expect(r.bonusUsd).toBe(100)
    expect(r.grossTotalUsd).toBe(600)
    expect(r.isrUsd).toBe(60) // 10% de 600
    expect(r.netPayUsd).toBe(540)
  })

  it('sin bonos se comporta como antes', () => {
    const r = calculateProfessionalServicesPayroll({ baseUsd: 500 }, 0.1)
    expect(r.bonusUsd).toBe(0)
    expect(r.grossTotalUsd).toBe(500)
    expect(r.isrUsd).toBe(50)
    expect(r.netPayUsd).toBe(450)
  })

  it('descuenta otras deducciones después de la retención', () => {
    const r = calculateProfessionalServicesPayroll(
      { baseUsd: 500, bonusUsd: 100, otherDeductionsUsd: 40 },
      0.1,
    )
    expect(r.grossTotalUsd).toBe(600)
    expect(r.isrUsd).toBe(60)
    expect(r.totalDeductionsUsd).toBe(100) // 60 ISR + 40 otras
    expect(r.netPayUsd).toBe(500)
  })
})
