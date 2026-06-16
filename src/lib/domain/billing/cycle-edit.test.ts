import { describe, it, expect } from 'vitest'
import {
  pricedSubtotal,
  expectedCycleAmount,
  isCycleEditable,
} from './cycle-edit'

describe('pricedSubtotal', () => {
  it('per_session: suma sesiones × precio', () => {
    expect(
      pricedSubtotal([
        { service: 'lenguaje', sessions_per_month: 4, unit_cost_usd: 25 },
        { service: 'ocupacional', sessions_per_month: 2, unit_cost_usd: 30 },
      ]),
    ).toBe(160) // 100 + 60
  })

  it('monthly_flat: 1 × precio, sin importar las sesiones', () => {
    expect(
      pricedSubtotal([
        { service: 'blue_kids', sessions_per_month: 20, unit_cost_usd: 150, billing_mode: 'monthly_flat' },
      ]),
    ).toBe(150)
  })

  it('servicio matutino sin billing_mode = monthly_flat implícito', () => {
    expect(
      pricedSubtotal([{ service: 'learning_kids', sessions_per_month: 12, unit_cost_usd: 120 }]),
    ).toBe(120)
  })

  it('mezcla per_session + monthly_flat', () => {
    expect(
      pricedSubtotal([
        { service: 'lenguaje', sessions_per_month: 4, unit_cost_usd: 25 }, // 100
        { service: 'blue_kids', sessions_per_month: 20, unit_cost_usd: 150, billing_mode: 'monthly_flat' }, // 150
      ]),
    ).toBe(250)
  })
})

describe('expectedCycleAmount', () => {
  const priced = [{ service: 'lenguaje', sessions_per_month: 4, unit_cost_usd: 25 }] // subtotal 100

  it('sin descuento = subtotal', () => {
    expect(expectedCycleAmount(priced, { kind: 'none', value: 0 })).toBe(100)
  })

  it('descuento porcentual', () => {
    expect(expectedCycleAmount(priced, { kind: 'percent', value: 10 })).toBe(90)
  })

  it('descuento fijo', () => {
    expect(expectedCycleAmount(priced, { kind: 'fixed', value: 15 })).toBe(85)
  })

  it('descuento fijo no baja de 0', () => {
    expect(expectedCycleAmount(priced, { kind: 'fixed', value: 999 })).toBe(0)
  })
})

describe('isCycleEditable', () => {
  it('generado + pendiente = editable', () => {
    expect(isCycleEditable({ status: 'generated', payment_status: 'pending' })).toBe(true)
  })

  it('generado + pagado = NO editable', () => {
    expect(isCycleEditable({ status: 'generated', payment_status: 'paid' })).toBe(false)
  })

  it('anulado = NO editable', () => {
    expect(isCycleEditable({ status: 'cancelled', payment_status: 'pending' })).toBe(false)
  })
})
