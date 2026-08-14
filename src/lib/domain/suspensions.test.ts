import { describe, it, expect } from 'vitest'
import {
  dateWithin,
  isSuspended,
  localDateSV,
  monthsInRange,
  suspensionRangeLabel,
  validateSuspensionRange,
} from './suspensions'

const viaje = { starts_on: '2026-08-01', ends_on: '2026-08-14' }

describe('localDateSV', () => {
  it('usa la fecha local de El Salvador, no UTC', () => {
    // 2026-08-15T02:00Z = 14-ago 20:00 en SV.
    expect(localDateSV('2026-08-15T02:00:00Z')).toBe('2026-08-14')
    expect(localDateSV('2026-08-15T18:00:00Z')).toBe('2026-08-15')
  })
})

describe('dateWithin', () => {
  it('el rango incluye ambos extremos', () => {
    expect(dateWithin('2026-08-01', viaje)).toBe(true)
    expect(dateWithin('2026-08-14', viaje)).toBe(true)
    expect(dateWithin('2026-07-31', viaje)).toBe(false)
    expect(dateWithin('2026-08-15', viaje)).toBe(false)
  })
})

describe('isSuspended', () => {
  it('una cita dentro del período cuenta como suspendida', () => {
    expect(isSuspended('2026-08-08T15:00:00-06:00', [viaje])).toBe(true)
    expect(isSuspended('2026-08-22T15:00:00-06:00', [viaje])).toBe(false)
  })

  it('una suspensión revertida ya no suspende nada', () => {
    expect(isSuspended('2026-08-08T15:00:00-06:00', [{ ...viaje, status: 'reverted' }])).toBe(false)
  })

  it('el último día cuenta completo aunque la cita sea de noche', () => {
    // 14-ago 19:00 SV = 15-ago 01:00 UTC: sin convertir a hora local caería fuera.
    expect(isSuspended('2026-08-15T01:00:00Z', [viaje])).toBe(true)
  })
})

describe('validateSuspensionRange', () => {
  it('exige ambas fechas', () => {
    expect(validateSuspensionRange('', '2026-08-14', [])?.field).toBe('starts_on')
    expect(validateSuspensionRange('2026-08-01', '', [])?.field).toBe('ends_on')
  })

  it('rechaza un regreso anterior a la salida', () => {
    expect(validateSuspensionRange('2026-08-14', '2026-08-01', [])?.field).toBe('ends_on')
  })

  it('acepta un rango de un solo día', () => {
    expect(validateSuspensionRange('2026-08-01', '2026-08-01', [])).toBeNull()
  })

  it('rechaza un rango que pisa otra suspensión activa', () => {
    expect(validateSuspensionRange('2026-08-10', '2026-08-20', [viaje])?.field).toBe('overlap')
    expect(validateSuspensionRange('2026-07-20', '2026-08-02', [viaje])?.field).toBe('overlap')
  })

  it('un rango pegado pero sin solape sí se acepta', () => {
    expect(validateSuspensionRange('2026-08-15', '2026-08-20', [viaje])).toBeNull()
  })

  it('ignora las revertidas al buscar solapes', () => {
    expect(
      validateSuspensionRange('2026-08-10', '2026-08-20', [{ ...viaje, status: 'reverted' }]),
    ).toBeNull()
  })
})

describe('monthsInRange', () => {
  it('un rango dentro de un mes da un solo mes', () => {
    expect(monthsInRange('2026-08-01', '2026-08-14')).toEqual(['2026-08-01'])
  })

  it('un rango que cruza meses los devuelve todos', () => {
    expect(monthsInRange('2026-07-28', '2026-09-03')).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
  })

  it('cruza el fin de año sin perderse', () => {
    expect(monthsInRange('2026-12-20', '2027-01-10')).toEqual(['2026-12-01', '2027-01-01'])
  })
})

describe('suspensionRangeLabel', () => {
  it('dentro del mismo mes no repite el mes', () => {
    expect(suspensionRangeLabel('2026-08-01', '2026-08-14')).toBe('del 1 al 14 de agosto de 2026')
  })

  it('entre meses distintos nombra ambos', () => {
    expect(suspensionRangeLabel('2026-07-28', '2026-08-05')).toContain('julio')
    expect(suspensionRangeLabel('2026-07-28', '2026-08-05')).toContain('agosto')
  })
})
