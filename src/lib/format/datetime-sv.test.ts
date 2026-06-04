import { describe, it, expect } from 'vitest'
import { formatSvTime, formatSvDateTime } from './datetime-sv'

// Una cita guardada como 21:00 UTC corresponde a las 15:00 (3:00 p.m.) en El Salvador.
// El bug que arreglamos: sin timeZone, en el server (UTC) se mostraba 9:00 p.m.
describe('formatSvTime — hora en zona El Salvador (no UTC)', () => {
  it('21:00 UTC → 3:00 p.m. SV (no 9:00 p.m.)', () => {
    const out = formatSvTime('2026-06-09T21:00:00Z')
    expect(out).toContain('3:00')
    expect(out).not.toContain('9:00')
  })

  it('15:00 UTC → 9:00 a.m. SV', () => {
    const out = formatSvTime('2026-06-09T15:00:00Z')
    expect(out).toContain('9:00')
  })

  it('medianoche UTC → 6:00 p.m. del día anterior en SV', () => {
    // 2026-06-09T00:00Z = 2026-06-08 18:00 SV
    const out = formatSvTime('2026-06-09T00:00:00Z')
    expect(out).toContain('6:00')
  })
})

describe('formatSvDateTime — fecha+hora en zona SV', () => {
  it('incluye la hora correcta de El Salvador', () => {
    const out = formatSvDateTime('2026-06-09T21:00:00Z')
    expect(out).toContain('3:00')
    // 21:00Z sigue siendo el 9 de junio en SV (15:00) — no debe correr el día.
    expect(out).toContain('9')
  })
})
