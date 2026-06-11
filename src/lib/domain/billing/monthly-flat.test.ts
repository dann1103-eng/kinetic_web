import { describe, expect, it } from 'vitest'
import {
  daysPerWeekLabel,
  isMonthlyFlatEntry,
  isMorningProgramService,
  therapyLineAmount,
} from './monthly-flat'

describe('isMorningProgramService', () => {
  it('reconoce los tres programas matutinos', () => {
    expect(isMorningProgramService('blue_kids')).toBe(true)
    expect(isMorningProgramService('learning_kids')).toBe(true)
    expect(isMorningProgramService('aula_educativa')).toBe(true)
  })
  it('rechaza terapias individuales', () => {
    expect(isMorningProgramService('lenguaje')).toBe(false)
    expect(isMorningProgramService('ocupacional')).toBe(false)
  })
})

describe('isMonthlyFlatEntry', () => {
  it('billing_mode explícito manda', () => {
    expect(isMonthlyFlatEntry({ service: 'lenguaje', billing_mode: 'monthly_flat' })).toBe(true)
    expect(isMonthlyFlatEntry({ service: 'blue_kids', billing_mode: 'per_session' })).toBe(false)
  })
  it('sin billing_mode: matutinos son flat implícito (planes existentes)', () => {
    expect(isMonthlyFlatEntry({ service: 'blue_kids' })).toBe(true)
    expect(isMonthlyFlatEntry({ service: 'aula_educativa' })).toBe(true)
    expect(isMonthlyFlatEntry({ service: 'lenguaje' })).toBe(false)
  })
})

describe('therapyLineAmount', () => {
  it('mensualidad fija: 1 × precio, ignora sesiones', () => {
    expect(
      therapyLineAmount({ service: 'blue_kids', sessions_per_month: 22, unit_cost_usd: 200 }),
    ).toBe(200)
    // Mes corto o largo: mismo monto.
    expect(
      therapyLineAmount({ service: 'blue_kids', sessions_per_month: 18, unit_cost_usd: 200 }),
    ).toBe(200)
  })
  it('per_session: sesiones × precio', () => {
    expect(
      therapyLineAmount({ service: 'lenguaje', sessions_per_month: 4, unit_cost_usd: 35 }),
    ).toBe(140)
  })
  it('redondea a centavos', () => {
    expect(
      therapyLineAmount({ service: 'lenguaje', sessions_per_month: 3, unit_cost_usd: 33.333 }),
    ).toBe(100)
  })
})

describe('daysPerWeekLabel', () => {
  it('singular/plural y null', () => {
    expect(daysPerWeekLabel(3)).toBe('3 días a la semana')
    expect(daysPerWeekLabel(1)).toBe('1 día a la semana')
    expect(daysPerWeekLabel(null)).toBeNull()
    expect(daysPerWeekLabel(0)).toBeNull()
  })
})
