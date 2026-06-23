import { describe, it, expect } from 'vitest'
import { resolveWindow } from './completed-therapies'

// La ventana se resuelve en zona SV (UTC-6): el inicio local 00:00 se traduce a
// 06:00 UTC del mismo día.

describe('resolveWindow — día', () => {
  it('cubre [00:00, 24:00) SV del día ancla', () => {
    const w = resolveWindow('dia', '2026-06-23')
    expect(w.startISO).toBe('2026-06-23T06:00:00.000Z')
    expect(w.endISO).toBe('2026-06-24T06:00:00.000Z')
  })
})

describe('resolveWindow — mes', () => {
  it('cubre el mes entero del ancla', () => {
    const w = resolveWindow('mes', '2026-06-15')
    expect(w.startISO).toBe('2026-06-01T06:00:00.000Z')
    expect(w.endISO).toBe('2026-07-01T06:00:00.000Z')
    expect(w.label).toBe('junio 2026')
  })
})

describe('resolveWindow — semana (lunes→lunes)', () => {
  it('un martes resuelve al lunes de esa semana', () => {
    // 2026-06-23 es martes → lunes 2026-06-22.
    const w = resolveWindow('semana', '2026-06-23')
    expect(w.startISO).toBe('2026-06-22T06:00:00.000Z')
    expect(w.endISO).toBe('2026-06-29T06:00:00.000Z')
  })

  it('un domingo pertenece a la semana que arranca el lunes anterior', () => {
    // 2026-06-28 es domingo → lunes 2026-06-22.
    const w = resolveWindow('semana', '2026-06-28')
    expect(w.startISO).toBe('2026-06-22T06:00:00.000Z')
    expect(w.endISO).toBe('2026-06-29T06:00:00.000Z')
  })
})
