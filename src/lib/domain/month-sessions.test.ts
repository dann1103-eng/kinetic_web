import { describe, it, expect } from 'vitest'
import { getMonthSessionsOverview } from './month-sessions'
import { morningLoadByDate } from './morning-attendance'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

// Noviembre 2026 en El Salvador (UTC-6): del 1-nov 06:00Z al 1-dic 06:00Z.
const START = '2026-11-01T06:00:00.000Z'
const END = '2026-12-01T06:00:00.000Z'

let seq = 0
/** Cita individual del mes. `day` es el día UTC; las 15:00Z caen a media mañana en SV. */
function appt(status: string, over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: 'a-' + String(seq).padStart(6, '0'),
    status,
    event_type: 'terapia',
    starts_at: '2026-11-10T15:00:00.000Z',
    ...over,
  }
}

const many = (n: number, status: string, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, () => appt(status, over))

const load = (tables: FakeTables) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMonthSessionsOverview(createFakeSupabase(tables) as any, START, END)

describe('getMonthSessionsOverview — citas individuales', () => {
  // Regresión del dashboard de admin (18-nov-2026): "Sesiones del mes" decía 1000
  // cuando había 1774 filas, y "asistidas" 72 cuando eran 249. PostgREST corta cada
  // respuesta en 1000 filas sin avisar.
  it('cuenta más de 1000 citas: no se queda en el tope de PostgREST', async () => {
    const o = await load({ appointments: many(1500, 'scheduled') })
    expect(o.total).toBe(1500)
    expect(o.scheduled).toBe(1500)
  })

  it('las completadas que quedaban después de la fila 1000 también se cuentan', async () => {
    // 1100 programadas primero y 150 completadas al final: con el corte solo
    // llegaba la primera tanda y "asistidas" salía en 0.
    const o = await load({
      appointments: [...many(1100, 'scheduled'), ...many(150, 'completed')],
    })
    expect(o.completed).toBe(150)
    expect(o.total).toBe(1250)
  })

  it('separa completadas, no-show y programadas; las cancelaciones tardías solo suman al total', async () => {
    const o = await load({
      appointments: [
        ...many(3, 'completed'),
        ...many(2, 'no_show'),
        ...many(1, 'late_cancel'),
        ...many(4, 'scheduled'),
        ...many(1, 'in_progress'),
      ],
    })
    expect(o).toMatchObject({ total: 11, completed: 3, noShow: 2, scheduled: 5 })
  })

  it('NO cuenta las lápidas rescheduled, las canceladas ni las citas sobrantes del programa matutino', async () => {
    const o = await load({
      appointments: [
        ...many(5, 'completed'),
        ...many(40, 'rescheduled'),
        ...many(7, 'cancelled'),
        // `regenerateMorningAppointments` deja una cita por niño que queda `scheduled`
        // para siempre (mig 0151): la asistencia real vive en las sesiones de grupo.
        ...many(30, 'scheduled', { event_type: 'programa_matutino' }),
      ],
    })
    expect(o.total).toBe(5)
    expect(o.completed).toBe(5)
    expect(o.scheduled).toBe(0)
  })

  it('no cuenta citas de otros meses y reparte por día local de El Salvador', async () => {
    const o = await load({
      appointments: [
        // 02-nov 03:30Z = 01-nov 21:30 en SV → día 1.
        appt('scheduled', { starts_at: '2026-11-02T03:30:00.000Z' }),
        // 01-dic 05:00Z = 30-nov 23:00 en SV → todavía noviembre, día 30.
        appt('scheduled', { starts_at: '2026-12-01T05:00:00.000Z' }),
        appt('scheduled', { starts_at: '2026-11-10T15:00:00.000Z' }),
        appt('scheduled', { starts_at: '2026-11-10T16:00:00.000Z' }),
        // Fuera del mes en SV.
        appt('scheduled', { starts_at: '2026-12-01T06:00:00.000Z' }),
        appt('scheduled', { starts_at: '2026-11-01T05:59:00.000Z' }),
      ],
    })
    expect(o.total).toBe(4)
    expect(o.byDay.get(1)).toBe(1)
    expect(o.byDay.get(10)).toBe(2)
    expect(o.byDay.get(30)).toBe(1)
  })
})

describe('getMonthSessionsOverview — programa matutino', () => {
  const members = [
    { child_id: 'c1', group_id: 'g1', attendance_days: [], active: true },
    { child_id: 'c2', group_id: 'g1', attendance_days: ['mon', 'wed'], active: true },
  ]
  // 2, 3 y 4 de noviembre de 2026 = lunes, martes y miércoles. 13:00Z = 7:00 en SV.
  const sessions = [
    { id: 's1', group_id: 'g1', session_date: '2026-11-02', starts_at: '2026-11-02T13:00:00.000Z', status: 'held' },
    { id: 's2', group_id: 'g1', session_date: '2026-11-03', starts_at: '2026-11-03T13:00:00.000Z', status: 'held' },
    { id: 's3', group_id: 'g1', session_date: '2026-11-04', starts_at: '2026-11-04T13:00:00.000Z', status: 'scheduled' },
    { id: 's4', group_id: 'g1', session_date: '2026-11-05', starts_at: '2026-11-05T13:00:00.000Z', status: 'cancelled' },
  ]
  const attendance = [
    { id: 'p1', child_id: 'c1', session_id: 's1', status: 'present' },
    { id: 'p2', child_id: 'c1', session_id: 's2', status: 'present' },
    { id: 'p3', child_id: 'c2', session_id: 's1', status: 'present' },
    { id: 'p4', child_id: 'c2', session_id: 's3', status: 'absent' },
  ]

  it('suma las jornadas de grupo al total y la asistencia a "asistidas", como en el panel de cada niño', async () => {
    const o = await load({
      appointments: [...many(2, 'completed'), ...many(1, 'no_show')],
      program_group_members: members,
      program_group_sessions: sessions,
      program_session_attendance: attendance,
    })
    // c1 asiste los 3 días activos; c2 solo lunes y miércoles (2) → 5 jornadas.
    // Presentes: c1 ×2 + c2 ×1 = 3. La sesión cancelada no cuenta.
    expect(o.total).toBe(3 + 5)
    expect(o.completed).toBe(2 + 3)
    expect(o.noShow).toBe(1)
  })

  it('reparte las jornadas por día para la carga del mes', async () => {
    const o = await load({
      program_group_members: members,
      program_group_sessions: sessions,
      program_session_attendance: attendance,
    })
    expect(o.byDay.get(2)).toBe(2) // lunes: c1 y c2
    expect(o.byDay.get(3)).toBe(1) // martes: solo c1
    expect(o.byDay.get(4)).toBe(2) // miércoles: c1 y c2
    expect(o.byDay.get(5)).toBeUndefined() // sesión cancelada
  })

  it('no se rompe sin ningún grupo matutino', async () => {
    const o = await load({ appointments: many(2, 'completed') })
    expect(o).toMatchObject({ total: 2, completed: 2 })
  })

  it('una asistencia matutina con más de 1000 filas llega completa', async () => {
    // niños × días pasa de 1000 con varios grupos: sin paginar, "presentes" se corta.
    const kids = Array.from({ length: 60 }, (_, i) => ({
      child_id: 'k' + i,
      group_id: 'g1',
      attendance_days: [],
      active: true,
    }))
    const days = Array.from({ length: 20 }, (_, i) => i + 1)
    const sess = days.map((d) => ({
      id: 'x' + d,
      group_id: 'g1',
      session_date: '2026-11-' + String(d).padStart(2, '0'),
      starts_at: '2026-11-' + String(d).padStart(2, '0') + 'T13:00:00.000Z',
      status: 'held',
    }))
    const att = kids.flatMap((k, ki) =>
      days.map((d) => ({
        id: `att-${String(ki).padStart(3, '0')}-${String(d).padStart(2, '0')}`,
        child_id: k.child_id,
        session_id: 'x' + d,
        status: 'present',
      })),
    )
    expect(att.length).toBe(1200)
    const o = await load({
      program_group_members: kids,
      program_group_sessions: sess,
      program_session_attendance: att,
    })
    expect(o.completed).toBe(1200)
    expect(o.total).toBe(1200)
  })
})

describe('morningLoadByDate', () => {
  it('cuenta, por fecha, cuántos niños tienen jornada ese día', () => {
    const load = morningLoadByDate(
      [
        { child_id: 'c1', group_id: 'g1', attendance_days: [] },
        { child_id: 'c2', group_id: 'g1', attendance_days: ['mon'] },
        { child_id: 'c3', group_id: 'g2', attendance_days: [] },
      ],
      [
        { id: 'a', group_id: 'g1', session_date: '2026-11-02', status: 'held' }, // lunes
        { id: 'b', group_id: 'g1', session_date: '2026-11-03', status: 'held' }, // martes
        { id: 'c', group_id: 'g2', session_date: '2026-11-03', status: 'scheduled' },
        { id: 'd', group_id: 'g1', session_date: '2026-11-04', status: 'cancelled' },
      ],
    )
    expect(load.get('2026-11-02')).toBe(2)
    expect(load.get('2026-11-03')).toBe(2) // c1 (g1) + c3 (g2)
    expect(load.has('2026-11-04')).toBe(false)
  })
})
