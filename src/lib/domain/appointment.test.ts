import { describe, it, expect } from 'vitest'
import { describeMonthlyConflict } from './appointment'

describe('describeMonthlyConflict', () => {
  it('distingue un conflicto con otra terapia de la MISMA niña/niño', () => {
    const msg = describeMonthlyConflict(
      { conflict_child_id: 'child-1' },
      'child-1',
      'lun. 15 jul, 9:30 a.m.',
    )
    expect(msg).toContain('misma niña/niño')
    expect(msg).not.toContain('otro paciente')
    expect(msg).toContain('lun. 15 jul, 9:30 a.m.')
  })

  it('distingue un conflicto con la cita de OTRO paciente', () => {
    const msg = describeMonthlyConflict(
      { conflict_child_id: 'child-2' },
      'child-1',
      'lun. 15 jul, 9:30 a.m.',
    )
    expect(msg).toContain('otro paciente')
    expect(msg).not.toContain('misma niña/niño')
  })
})
