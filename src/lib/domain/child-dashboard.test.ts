import { describe, it, expect } from 'vitest'
import { getChildDashboardData } from './child-dashboard'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

/**
 * Escenario calcado del caso reportado: un niño con mensualidad de BlueKids de
 * lunes a viernes + Lenguaje los sábados.
 *
 * "Hoy" es el miércoles 26 de agosto de 2026, 12:30 p.m. de El Salvador
 * (18:30 UTC), que es cuando se reportó: la agenda mostraba DOS bloques de
 * BlueKids por día a partir del jueves 27, y ninguno antes.
 */
const NOW = new Date('2026-08-26T18:30:00.000Z')
const MONTH = '2026-08'
const CHILD = 'nino-bk'
const GROUP = 'grupo-BK'

/** Sesión de grupo: 7:30 a.m. hora SV = 13:30 UTC. */
function session(day: number, status = 'held') {
  const d = String(day).padStart(2, '0')
  return {
    id: `sesion-${d}`,
    group_id: GROUP,
    session_date: `2026-08-${d}`,
    starts_at: `2026-08-${d}T13:30:00.000Z`,
    ends_at: `2026-08-${d}T17:30:00.000Z`,
    status,
  }
}

/**
 * Cita leftover por-niño de programa matutino. `regenerateMorningAppointments`
 * las sigue creando además de la sesión de grupo, y nacen `scheduled` para
 * siempre (mig 0151). No deben verse en ningún lado: la sesión de grupo es la
 * que manda.
 */
function leftoverMorning(day: number) {
  const d = String(day).padStart(2, '0')
  return {
    id: `leftover-${d}`,
    child_id: CHILD,
    event_type: 'programa_matutino',
    service_type: 'blue_kids',
    status: 'scheduled',
    starts_at: `2026-08-${d}T13:30:00.000Z`,
    ends_at: `2026-08-${d}T17:30:00.000Z`,
    parent_appointment_id: null,
  }
}

/** Terapia individual de Lenguaje, sábados 2:00 p.m. SV = 20:00 UTC. */
function lenguaje(day: number, status: string) {
  const d = String(day).padStart(2, '0')
  return {
    id: `leng-${d}`,
    child_id: CHILD,
    event_type: 'terapia',
    service_type: 'lenguaje',
    status,
    starts_at: `2026-08-${d}T20:00:00.000Z`,
    ends_at: `2026-08-${d}T20:30:00.000Z`,
    parent_appointment_id: null,
  }
}

function tables(): FakeTables {
  return {
    appointments: [
      // Mañanas: martes 25 y miércoles 26 ya pasaron; jueves 27 y viernes 28 no.
      leftoverMorning(25),
      leftoverMorning(26),
      leftoverMorning(27),
      leftoverMorning(28),
      lenguaje(22, 'completed'),
      lenguaje(29, 'scheduled'),
    ],
    appointment_absences: [],
    program_groups: [{ id: GROUP, name: 'BK1', program: 'blue_kids' }],
    program_group_members: [
      { child_id: CHILD, group_id: GROUP, attendance_days: [], active: true },
    ],
    program_group_sessions: [session(25), session(26), session(27, 'scheduled'), session(28, 'scheduled')],
    program_session_attendance: [
      { child_id: CHILD, session_id: 'sesion-25', status: 'present' },
      { child_id: CHILD, session_id: 'sesion-26', status: 'present' },
    ],
  }
}

const load = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getChildDashboardData(createFakeSupabase(tables()) as any, CHILD, NOW, MONTH)

/**
 * Reproduce el merge que hace ChildDashboardCalendar: junta las celdas del mes
 * con las próximas 14 días y descarta repetidos POR ID. Los leftover son otra
 * fila con otro id, así que ese dedupe no los atrapa: por eso se veían dos
 * bloques el mismo día.
 */
function calendarBlocksByDay(data: Awaited<ReturnType<typeof load>>) {
  const seen = new Set<string>()
  const byDay = new Map<string, string[]>()
  const add = (id: string, startsAt: string, service: string | null) => {
    if (seen.has(id)) return
    seen.add(id)
    const day = startsAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), service ?? 'sin-servicio'])
  }
  for (const cell of data.attendance) {
    for (const a of cell.appointments) add(a.id, a.starts_at, a.service_type)
  }
  for (const u of data.upcoming) add(u.id, u.starts_at, u.service_type)
  return byDay
}

describe('getChildDashboardData — programas matutinos duplicados', () => {
  it('las próximas sesiones no repiten el programa matutino', async () => {
    const data = await load()

    const blueKids = data.upcoming.filter((u) => u.service_type === 'blue_kids')
    // Jueves 27 y viernes 28: una entrada cada uno, no dos.
    expect(blueKids).toHaveLength(2)
    expect(blueKids.map((u) => u.starts_at.slice(0, 10))).toEqual(['2026-08-27', '2026-08-28'])
  })

  it('el calendario pinta un solo bloque de BlueKids por día', async () => {
    const byDay = calendarBlocksByDay(await load())

    expect(byDay.get('2026-08-27')).toEqual(['blue_kids'])
    expect(byDay.get('2026-08-28')).toEqual(['blue_kids'])
    // Los días ya pasados nunca se duplicaron (no entran a "próximas 14 días").
    expect(byDay.get('2026-08-25')).toEqual(['blue_kids'])
  })

  it('ninguna cita leftover de programa matutino llega a la UI', async () => {
    const data = await load()

    const ids = [
      ...data.attendance.flatMap((c) => c.appointments.map((a) => a.id)),
      ...data.upcoming.map((u) => u.id),
    ]
    expect(ids.filter((id) => id.startsWith('leftover-'))).toEqual([])
  })
})

describe('getChildDashboardData — el KPI de sesiones del mes', () => {
  it('cuenta las terapias individuales y las sesiones de grupo del mes', async () => {
    const { kpis } = await load()

    // 2 de Lenguaje (22 y 29) + 4 mañanas de grupo.
    expect(kpis.total).toBe(6)
  })

  it('no cuenta las citas leftover como programadas', async () => {
    const { kpis } = await load()

    // Solo Lenguaje del sábado 29 sigue pendiente; las 4 leftover no cuentan.
    expect(kpis.scheduled).toBe(1)
  })

  it('las asistidas suman las terapias completadas y las mañanas presentes', async () => {
    const { kpis } = await load()

    // Lenguaje del 22 + presentes del 25 y 26.
    expect(kpis.completed).toBe(3)
  })
})
