import { describe, it, expect } from 'vitest'
import { getNinosDashboardData } from './ninos-dashboard'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

const MONTH = '2026-08'

let seq = 0
const day2 = (d: number) => String(d).padStart(2, '0')

/** Cita individual dentro de agosto 2026 (dentro de los bounds del mes en SV). */
function appt(child_id: string, status: string, day = 10, event_type = 'terapia') {
  seq += 1
  return {
    id: 'a-' + seq,
    child_id,
    status,
    event_type,
    starts_at: '2026-08-' + day2(day) + 'T15:00:00.000Z',
  }
}

/** Sesión de grupo matutino de agosto 2026. */
function groupSession(id: string, day: number, group_id = 'grupo-BK', status = 'held') {
  return {
    id,
    group_id,
    session_date: '2026-08-' + day2(day),
    starts_at: '2026-08-' + day2(day) + 'T13:00:00.000Z',
    ends_at: '2026-08-' + day2(day) + 'T17:00:00.000Z',
    status,
  }
}

const CHILD = { id: 'nino-bk', full_name: 'Zelaya Molina, Alex', archived_at: null }

function baseTables(over: Partial<FakeTables> = {}): FakeTables {
  return {
    children: [CHILD],
    treatment_plans: [],
    appointments: [],
    monthly_session_cycles: [],
    program_group_members: [],
    program_group_staff: [],
    program_group_sessions: [],
    program_session_attendance: [],
    program_groups: [],
    users: [],
    ...over,
  }
}

const load = (tables: FakeTables) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNinosDashboardData(createFakeSupabase(tables) as any, MONTH)

describe('getNinosDashboardData — asistencia de programas matutinos', () => {
  it('cuenta la asistencia de grupo de un niño que solo va a programa matutino', async () => {
    const tables = baseTables({
      program_group_members: [
        { child_id: 'nino-bk', group_id: 'grupo-BK', attendance_days: [], active: true },
      ],
      program_group_sessions: [groupSession('s1', 3), groupSession('s2', 4), groupSession('s3', 5)],
      program_session_attendance: [
        { child_id: 'nino-bk', session_id: 's1', status: 'present' },
        { child_id: 'nino-bk', session_id: 's2', status: 'present' },
        { child_id: 'nino-bk', session_id: 's3', status: 'absent' },
      ],
    })

    const { niños } = await load(tables)

    expect(niños[0].attendance).toEqual({ completed: 2, total: 3 })
  })

  it('suma el programa matutino a las terapias individuales del mismo niño', async () => {
    const tables = baseTables({
      appointments: [
        appt('nino-bk', 'completed', 11),
        appt('nino-bk', 'completed', 18),
        appt('nino-bk', 'no_show', 25),
      ],
      program_group_members: [
        { child_id: 'nino-bk', group_id: 'grupo-BK', attendance_days: [], active: true },
      ],
      program_group_sessions: [groupSession('s1', 3), groupSession('s2', 4)],
      program_session_attendance: [
        { child_id: 'nino-bk', session_id: 's1', status: 'present' },
        { child_id: 'nino-bk', session_id: 's2', status: 'present' },
      ],
    })

    const { niños } = await load(tables)

    // 2 terapias completadas de 3 + 2 mañanas presentes de 2.
    expect(niños[0].attendance).toEqual({ completed: 4, total: 5 })
  })

  it('no cuenta dos veces la cita leftover por-niño de programa_matutino', async () => {
    // regenerateMorningAppointments sigue creando una cita por-niño además de la
    // sesión de grupo real (mig 0151). Contar ambas duplicaba cada mañana.
    const tables = baseTables({
      appointments: [
        appt('nino-bk', 'scheduled', 3, 'programa_matutino'),
        appt('nino-bk', 'scheduled', 4, 'programa_matutino'),
      ],
      program_group_members: [
        { child_id: 'nino-bk', group_id: 'grupo-BK', attendance_days: [], active: true },
      ],
      program_group_sessions: [groupSession('s1', 3), groupSession('s2', 4)],
      program_session_attendance: [
        { child_id: 'nino-bk', session_id: 's1', status: 'present' },
        { child_id: 'nino-bk', session_id: 's2', status: 'present' },
      ],
    })

    const { niños } = await load(tables)

    expect(niños[0].attendance).toEqual({ completed: 2, total: 2 })
  })

  it('respeta los attendance_days del niño dentro del grupo', async () => {
    const tables = baseTables({
      program_group_members: [
        // Solo lunes. En agosto 2026 el 3 es lunes y el 4 es martes.
        { child_id: 'nino-bk', group_id: 'grupo-BK', attendance_days: ['mon'], active: true },
      ],
      program_group_sessions: [groupSession('s1', 3), groupSession('s2', 4)],
      program_session_attendance: [{ child_id: 'nino-bk', session_id: 's1', status: 'present' }],
    })

    const { niños } = await load(tables)

    expect(niños[0].attendance).toEqual({ completed: 1, total: 1 })
  })

  it('no inventa barra para un niño sin terapias ni programa', async () => {
    const { niños } = await load(baseTables())

    expect(niños[0].attendance).toBeNull()
  })
})

describe('getNinosDashboardData — el tope de 1000 filas de PostgREST', () => {
  it('no pierde citas cuando el mes supera las 1000 filas', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => appt('nino-bk', 'completed', (i % 28) + 1))

    const { niños } = await load(baseTables({ appointments: many }))

    expect(niños[0].attendance).toEqual({ completed: 1200, total: 1200 })
  })

  it('no pierde asistencia de grupo cuando la lista pasada supera las 1000 filas', async () => {
    const sessions = Array.from({ length: 20 }, (_, i) => groupSession('s' + i, i + 1))
    // 60 niños del grupo × 20 sesiones = 1200 filas de asistencia.
    const otherChildren = Array.from({ length: 59 }, (_, i) => ({
      id: 'otro-' + i,
      full_name: 'Escobar Ayala, Nino ' + i,
      archived_at: null,
    }))
    const members = [
      { child_id: 'nino-bk', group_id: 'grupo-BK', attendance_days: [] as string[], active: true },
    ]
    const attendance: Record<string, unknown>[] = []
    for (const s of sessions) {
      attendance.push({ child_id: 'nino-bk', session_id: s.id, status: 'present' })
    }
    for (const c of otherChildren) {
      members.push({ child_id: c.id, group_id: 'grupo-BK', attendance_days: [], active: true })
      for (const s of sessions) {
        attendance.push({ child_id: c.id, session_id: s.id, status: 'present' })
      }
    }

    const { niños } = await load(
      baseTables({
        children: [CHILD, ...otherChildren],
        program_group_members: members,
        program_group_sessions: sessions,
        program_session_attendance: attendance,
      }),
    )

    const bk = niños.find((n) => n.child.id === 'nino-bk')
    expect(bk?.attendance).toEqual({ completed: 20, total: 20 })
  })

  it('encuentra el último ciclo aunque haya más de 1000 ciclos más recientes', async () => {
    const otherChildren = Array.from({ length: 5 }, (_, i) => ({
      id: 'otro-' + i,
      full_name: 'Escobar Ayala, Nino ' + i,
      archived_at: null,
    }))
    const cycles: Record<string, unknown>[] = []
    for (let i = 0; i < 1010; i++) {
      cycles.push({
        id: 'c-' + i,
        child_id: 'otro-' + (i % 5),
        status: 'generated',
        period_month: '2026-08-01',
      })
    }
    cycles.push({
      id: 'c-viejo',
      child_id: 'nino-bk',
      status: 'generated',
      period_month: '2025-01-01',
    })

    const { niños } = await load(
      baseTables({ children: [CHILD, ...otherChildren], monthly_session_cycles: cycles }),
    )

    const bk = niños.find((n) => n.child.id === 'nino-bk')
    expect(bk?.lastCycle?.id).toBe('c-viejo')
  })
})
