import { describe, it, expect } from 'vitest'
import { getAppointmentsHeatmapMonth, getTopTherapistsThisMonth } from './dashboard-widgets'
import { getMonthSessionsOverview } from './month-sessions'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

// "Hoy" = 18-nov-2026 12:00 en SV. El mes es noviembre (30 días).
const NOW = new Date('2026-11-18T18:00:00.000Z')

let seq = 0
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fake = (t: FakeTables) => createFakeSupabase(t) as any

describe('getAppointmentsHeatmapMonth — "Carga del mes"', () => {
  // Con el tope de PostgREST el widget decía "1000 citas" y los días de más abajo
  // quedaban subcontados.
  it('suma más de 1000 citas repartidas por día', async () => {
    const t: FakeTables = {
      appointments: [
        ...many(700, 'scheduled', { starts_at: '2026-11-05T15:00:00.000Z' }),
        ...many(500, 'scheduled', { starts_at: '2026-11-25T15:00:00.000Z' }),
      ],
    }
    const series = await getAppointmentsHeatmapMonth(fake(t), NOW)
    expect(series).toHaveLength(30)
    expect(series.find((d) => d.day === 5)?.count).toBe(700)
    expect(series.find((d) => d.day === 25)?.count).toBe(500)
    expect(series.reduce((s, d) => s + d.count, 0)).toBe(1200)
  })

  it('no cuenta lápidas, canceladas ni las citas sobrantes del programa matutino', async () => {
    const t: FakeTables = {
      appointments: [
        ...many(4, 'scheduled'),
        ...many(9, 'rescheduled'),
        ...many(3, 'cancelled'),
        ...many(6, 'scheduled', { event_type: 'programa_matutino' }),
      ],
    }
    const series = await getAppointmentsHeatmapMonth(fake(t), NOW)
    expect(series.reduce((s, d) => s + d.count, 0)).toBe(4)
  })

  it('el total de la carga del mes es el mismo número que "Sesiones del mes"', async () => {
    const t: FakeTables = {
      appointments: [
        ...many(1100, 'scheduled'),
        ...many(200, 'completed', { starts_at: '2026-11-03T15:00:00.000Z' }),
        ...many(30, 'rescheduled'),
      ],
      program_group_members: [{ child_id: 'c1', group_id: 'g1', attendance_days: [], active: true }],
      program_group_sessions: [
        { id: 's1', group_id: 'g1', session_date: '2026-11-02', starts_at: '2026-11-02T13:00:00.000Z', status: 'held' },
        { id: 's2', group_id: 'g1', session_date: '2026-11-03', starts_at: '2026-11-03T13:00:00.000Z', status: 'held' },
      ],
    }
    const series = await getAppointmentsHeatmapMonth(fake(t), NOW)
    const overview = await getMonthSessionsOverview(
      fake(t),
      '2026-11-01T06:00:00.000Z',
      '2026-12-01T06:00:00.000Z',
    )
    expect(series.reduce((s, d) => s + d.count, 0)).toBe(overview.total)
    expect(overview.total).toBe(1100 + 200 + 2)
  })
})

describe('getTopTherapistsThisMonth', () => {
  it('cuenta más de 1000 sesiones terminadas de una terapista', async () => {
    const t: FakeTables = {
      therapy_sessions: [
        ...Array.from({ length: 1200 }, (_, i) => ({
          id: 'ts-' + String(i).padStart(5, '0'),
          therapist_id: 't1',
          started_at: '2026-11-05T15:00:00.000Z',
          ended_at: '2026-11-05T15:30:00.000Z',
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: 'tt-' + i,
          therapist_id: 't2',
          started_at: '2026-11-05T15:00:00.000Z',
          ended_at: '2026-11-05T15:30:00.000Z',
        })),
      ],
      session_reports: [],
      users: [
        { id: 't1', full_name: 'Terapista Uno' },
        { id: 't2', full_name: 'Terapista Dos' },
      ],
    }
    const rows = await getTopTherapistsThisMonth(fake(t), NOW, 5)
    expect(rows[0]).toMatchObject({ therapistId: 't1', sessionsCompleted: 1200 })
    expect(rows[1]).toMatchObject({ therapistId: 't2', sessionsCompleted: 3 })
  })
})
