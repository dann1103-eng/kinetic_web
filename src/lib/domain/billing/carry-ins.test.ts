import { describe, it, expect } from 'vitest'
import { chargeTotalWithCarryIns, computeCarryIns } from './carry-ins'

const base = {
  cycle: {
    period_month: '2026-09-01',
    surcharge_carried_in_usd: 0,
    billing_adjustment_carried_in_usd: 0,
  },
  familyLateFeeExempt: false,
  pendingSurchargeCycles: [] as { id: string; period_month: string; surcharge_amount_usd: number }[],
  pendingAdjustmentCycles: [] as {
    id: string
    period_month: string
    billing_adjustment_usd: number
  }[],
}

describe('computeCarryIns', () => {
  it('sin nada pendiente no arrastra ninguna línea', () => {
    const res = computeCarryIns(base)

    expect(res.lines).toEqual([])
    expect(res.surchargeTotal).toBe(0)
    expect(res.adjustmentTotal).toBe(0)
  })

  it('arrastra el recargo de un mes anterior pagado tarde', () => {
    const res = computeCarryIns({
      ...base,
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })

    expect(res.surchargeTotal).toBe(12.5)
    expect(res.surchargeFromCycleIds).toEqual(['c-ago'])
    expect(res.lines[0].amount).toBe(12.5)
    expect(res.lines[0].description).toContain('agosto')
  })

  it('suma varios meses atrasados', () => {
    const res = computeCarryIns({
      ...base,
      pendingSurchargeCycles: [
        { id: 'c-jul', period_month: '2026-07-01', surcharge_amount_usd: 10 },
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })

    expect(res.surchargeTotal).toBe(22.5)
    expect(res.surchargeFromCycleIds).toEqual(['c-jul', 'c-ago'])
    expect(res.lines).toHaveLength(2)
  })

  it('una familia exonerada no arrastra recargos', () => {
    const res = computeCarryIns({
      ...base,
      familyLateFeeExempt: true,
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })

    expect(res.surchargeTotal).toBe(0)
    expect(res.lines).toEqual([])
  })

  it('un arrastre ya registrado gana y no vuelve a buscar meses anteriores', () => {
    // Factura regenerada: el arrastre quedó grabado en el ciclo. Volver a
    // sumarlo desde los ciclos viejos lo cobraría dos veces.
    const res = computeCarryIns({
      ...base,
      cycle: { ...base.cycle, surcharge_carried_in_usd: 20 },
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })

    expect(res.surchargeTotal).toBe(20)
    expect(res.surchargeFromCycleIds).toEqual([])
    expect(res.lines).toHaveLength(1)
  })

  it('el crédito de un mes ya pagado viaja como monto negativo', () => {
    const res = computeCarryIns({
      ...base,
      pendingAdjustmentCycles: [
        { id: 'c-ago', period_month: '2026-08-01', billing_adjustment_usd: -22 },
      ],
    })

    expect(res.adjustmentTotal).toBe(-22)
    expect(res.lines[0].amount).toBe(-22)
    expect(res.lines[0].description).toContain('Crédito')
  })

  it('la exoneración de mora NO exonera los ajustes de plan', () => {
    // Son cosas distintas: `late_fee_exempt` perdona la multa por pagar tarde,
    // no una diferencia de plan que ya se cobró de más o de menos.
    const res = computeCarryIns({
      ...base,
      familyLateFeeExempt: true,
      pendingAdjustmentCycles: [
        { id: 'c-ago', period_month: '2026-08-01', billing_adjustment_usd: 15 },
      ],
    })

    expect(res.adjustmentTotal).toBe(15)
    expect(res.adjustmentFromCycleIds).toEqual(['c-ago'])
  })

  it('un ajuste ya registrado gana sobre los meses anteriores', () => {
    const res = computeCarryIns({
      ...base,
      cycle: { ...base.cycle, billing_adjustment_carried_in_usd: -8 },
      pendingAdjustmentCycles: [
        { id: 'c-ago', period_month: '2026-08-01', billing_adjustment_usd: -22 },
      ],
    })

    expect(res.adjustmentTotal).toBe(-8)
    expect(res.adjustmentFromCycleIds).toEqual([])
  })

  it('recargo y ajuste se arrastran juntos, cada uno con su línea', () => {
    const res = computeCarryIns({
      ...base,
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
      pendingAdjustmentCycles: [
        { id: 'c-ago', period_month: '2026-08-01', billing_adjustment_usd: -22 },
      ],
    })

    expect(res.lines).toHaveLength(2)
    expect(res.surchargeTotal).toBe(12.5)
    expect(res.adjustmentTotal).toBe(-22)
  })
})

describe('chargeTotalWithCarryIns', () => {
  const base = { subtotal: 236, discountAmount: 0, rolloverDiscountUsd: 0, carryInTotal: 0 }

  it('sin descuentos ni arrastres cobra el subtotal', () => {
    expect(chargeTotalWithCarryIns(base)).toBe(236)
  })

  it('un crédito arrastrado baja el total', () => {
    expect(chargeTotalWithCarryIns({ ...base, carryInTotal: -22 })).toBe(214)
  })

  it('un recargo arrastrado lo sube', () => {
    expect(chargeTotalWithCarryIns({ ...base, carryInTotal: 12.5 })).toBe(248.5)
  })

  it('el rollover en modo descuento también descuenta', () => {
    expect(chargeTotalWithCarryIns({ ...base, rolloverDiscountUsd: 40 })).toBe(196)
  })

  it('el tope va sobre la SUMA de los descuentos, no sobre cada uno', () => {
    // Con un descuento fijo de 200 y rollover de 100, topar cada uno por
    // separado dejaría el total en -64. El tope es conjunto: el mes cae a 0.
    expect(
      chargeTotalWithCarryIns({ subtotal: 236, discountAmount: 200, rolloverDiscountUsd: 100, carryInTotal: 0 }),
    ).toBe(0)
  })

  it('con el mes en cero, un recargo arrastrado se sigue cobrando', () => {
    expect(
      chargeTotalWithCarryIns({ subtotal: 236, discountAmount: 236, rolloverDiscountUsd: 0, carryInTotal: 12.5 }),
    ).toBe(12.5)
  })
})
