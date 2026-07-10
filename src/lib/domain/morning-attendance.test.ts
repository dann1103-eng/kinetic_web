import { describe, it, expect } from 'vitest'
import {
  computeMorningAttendance,
  type GroupMembershipLite,
  type GroupSessionLite,
  type AttendanceRowLite,
} from './morning-attendance'

// Julio 2026: los lunes caen 6, 13, 20, 27; los miércoles 1, 8, 15, 22, 29.
const M_LUN_MIE: GroupMembershipLite = {
  child_id: 'nino-1',
  group_id: 'grupo-A',
  attendance_days: ['mon', 'wed'],
}

function session(id: string, date: string, status = 'scheduled', group = 'grupo-A'): GroupSessionLite {
  return { id, group_id: group, session_date: date, status }
}

describe('computeMorningAttendance', () => {
  it('total = sesiones del mes en los días del niño; present = filas present', () => {
    const sessions: GroupSessionLite[] = [
      session('s1', '2026-07-06'), // lunes  ✓
      session('s2', '2026-07-08'), // miércoles ✓
      session('s3', '2026-07-13'), // lunes ✓ (futura, sin lista aún)
      session('s4', '2026-07-07'), // martes ✗ (no es día del niño)
    ]
    const attendance: AttendanceRowLite[] = [
      { child_id: 'nino-1', session_id: 's1', status: 'present' },
      { child_id: 'nino-1', session_id: 's2', status: 'absent' },
    ]
    const result = computeMorningAttendance([M_LUN_MIE], sessions, attendance)
    // total: s1, s2, s3 (martes excluido) = 3; present: s1 = 1
    expect(result.get('nino-1')).toEqual({ present: 1, total: 3 })
  })

  it('excluye sesiones canceladas del total y del present', () => {
    const sessions: GroupSessionLite[] = [
      session('s1', '2026-07-06', 'held'),
      session('s2', '2026-07-08', 'cancelled'),
    ]
    const attendance: AttendanceRowLite[] = [
      { child_id: 'nino-1', session_id: 's1', status: 'present' },
      { child_id: 'nino-1', session_id: 's2', status: 'present' }, // sobre sesión cancelada → no cuenta
    ]
    const result = computeMorningAttendance([M_LUN_MIE], sessions, attendance)
    expect(result.get('nino-1')).toEqual({ present: 1, total: 1 })
  })

  it('attendance_days vacío = cuenta todas las sesiones del grupo', () => {
    const member: GroupMembershipLite = { child_id: 'nino-2', group_id: 'grupo-A', attendance_days: [] }
    const sessions: GroupSessionLite[] = [
      session('s1', '2026-07-06'),
      session('s2', '2026-07-07'),
      session('s3', '2026-07-08'),
    ]
    const result = computeMorningAttendance([member], sessions, [])
    expect(result.get('nino-2')).toEqual({ present: 0, total: 3 })
  })

  it('suma varios grupos del mismo niño', () => {
    const m1: GroupMembershipLite = { child_id: 'n', group_id: 'A', attendance_days: ['mon'] }
    const m2: GroupMembershipLite = { child_id: 'n', group_id: 'B', attendance_days: ['wed'] }
    const sessions: GroupSessionLite[] = [
      session('a1', '2026-07-06', 'scheduled', 'A'), // lunes ✓
      session('b1', '2026-07-08', 'scheduled', 'B'), // miércoles ✓
    ]
    const attendance: AttendanceRowLite[] = [
      { child_id: 'n', session_id: 'a1', status: 'present' },
    ]
    const result = computeMorningAttendance([m1, m2], sessions, attendance)
    expect(result.get('n')).toEqual({ present: 1, total: 2 })
  })

  it('niño sin membresías no aparece en el resultado', () => {
    const result = computeMorningAttendance([], [session('s1', '2026-07-06')], [])
    expect(result.size).toBe(0)
  })
})
