import { describe, it, expect } from 'vitest'
import {
  calculateWeeklyOccupancy,
  startOfWeekMonday,
  type TherapistLite,
  type AppointmentLite,
  type GroupSessionLite,
} from './therapist-capacity'
import type { TherapistWorkScheduleBlock } from '@/types/db'

// Semana de referencia: lunes 6 jul 2026 (hora local del runner).
const WEEK_START = startOfWeekMonday(new Date(2026, 6, 8, 12, 0, 0)) // mié 8 jul → lun 6 jul

const T_MAESTRA: TherapistLite = { id: 'maestra-1', full_name: 'Maestra Uno', max_hours_per_week: 40 }
const T_OTRA: TherapistLite = { id: 'otra-1', full_name: 'Otra Dos', max_hours_per_week: 40 }

/** Helper: ISO de un día de la semana de referencia a una hora local. */
function at(dayOffset: number, hour: number, min = 0): string {
  const d = new Date(WEEK_START)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

function appt(partial: Partial<AppointmentLite>): AppointmentLite {
  return {
    therapist_id: T_MAESTRA.id,
    assignee_ids: null,
    event_type: 'terapia',
    starts_at: at(0, 8),
    ends_at: at(0, 9),
    status: 'scheduled',
    ...partial,
  }
}

const NO_SCHEDULES: TherapistWorkScheduleBlock[] = []

describe('calculateWeeklyOccupancy — bug de grupos matutinos', () => {
  it('NO cuenta las citas programa_matutino por-niño (evita el sobre-conteo)', () => {
    // 7 niños del mismo grupo, misma maestra, mismo horario 8-11 (3h c/u).
    const appts: AppointmentLite[] = Array.from({ length: 7 }, () =>
      appt({ event_type: 'programa_matutino', starts_at: at(0, 8), ends_at: at(0, 11) }),
    )
    const [occ] = calculateWeeklyOccupancy([T_MAESTRA], NO_SCHEDULES, appts, [], WEEK_START)
    // Sin el fix esto daría 21h (7 × 3h). Con el fix: 0 (se cuentan por bloque de grupo).
    expect(occ.totalWorkedMinutes).toBe(0)
  })

  it('cuenta el bloque de grupo UNA vez por su duración real', () => {
    const sessions: GroupSessionLite[] = [
      { staffUserIds: [T_MAESTRA.id], starts_at: at(0, 8), ends_at: at(0, 11), status: 'scheduled' },
    ]
    const [occ] = calculateWeeklyOccupancy([T_MAESTRA], NO_SCHEDULES, [], sessions, WEEK_START)
    expect(occ.totalWorkedMinutes).toBe(180) // 3h, una sola vez
  })

  it('excluye sesiones de grupo canceladas', () => {
    const sessions: GroupSessionLite[] = [
      { staffUserIds: [T_MAESTRA.id], starts_at: at(0, 8), ends_at: at(0, 11), status: 'cancelled' },
    ]
    const [occ] = calculateWeeklyOccupancy([T_MAESTRA], NO_SCHEDULES, [], sessions, WEEK_START)
    expect(occ.totalWorkedMinutes).toBe(0)
  })

  it('reparte una sesión de grupo compartida a cada staff', () => {
    const sessions: GroupSessionLite[] = [
      { staffUserIds: [T_MAESTRA.id, T_OTRA.id], starts_at: at(0, 8), ends_at: at(0, 10), status: 'held' },
    ]
    const [occM, occO] = calculateWeeklyOccupancy([T_MAESTRA, T_OTRA], NO_SCHEDULES, [], sessions, WEEK_START)
    expect(occM.totalWorkedMinutes).toBe(120)
    expect(occO.totalWorkedMinutes).toBe(120)
  })
})

describe('calculateWeeklyOccupancy — todos los tipos de evento + asignados', () => {
  it('cuenta eventos que NO son terapia (reunión, entrevista, evaluación)', () => {
    const appts: AppointmentLite[] = [
      appt({ event_type: 'reunion_padres', starts_at: at(0, 8), ends_at: at(0, 9) }),
      appt({ event_type: 'evaluacion', starts_at: at(0, 9), ends_at: at(0, 10, 30) }),
    ]
    const [occ] = calculateWeeklyOccupancy([T_MAESTRA], NO_SCHEDULES, appts, [], WEEK_START)
    expect(occ.totalWorkedMinutes).toBe(60 + 90)
  })

  it('cuenta la cita para cada persona en assignee_ids, no solo el principal', () => {
    const appts: AppointmentLite[] = [
      appt({
        event_type: 'reunion_colegio',
        therapist_id: T_MAESTRA.id,
        assignee_ids: [T_OTRA.id],
        starts_at: at(1, 10),
        ends_at: at(1, 11),
      }),
    ]
    const [occM, occO] = calculateWeeklyOccupancy([T_MAESTRA, T_OTRA], NO_SCHEDULES, appts, [], WEEK_START)
    expect(occM.totalWorkedMinutes).toBe(60)
    expect(occO.totalWorkedMinutes).toBe(60)
  })

  it('NO doble-cuenta cuando el principal también está en assignee_ids', () => {
    const appts: AppointmentLite[] = [
      appt({
        event_type: 'entrega_avances',
        therapist_id: T_MAESTRA.id,
        assignee_ids: [T_MAESTRA.id, T_OTRA.id],
        starts_at: at(2, 9),
        ends_at: at(2, 10),
      }),
    ]
    const [occM] = calculateWeeklyOccupancy([T_MAESTRA, T_OTRA], NO_SCHEDULES, appts, [], WEEK_START)
    expect(occM.totalWorkedMinutes).toBe(60) // no 120
  })

  it('sigue excluyendo estados no ocupacionales (rescheduled/no_show/late_cancel/cancelled)', () => {
    const appts: AppointmentLite[] = [
      appt({ status: 'rescheduled' }),
      appt({ status: 'no_show' }),
      appt({ status: 'late_cancel' }),
      appt({ status: 'cancelled' }),
    ]
    const [occ] = calculateWeeklyOccupancy([T_MAESTRA], NO_SCHEDULES, appts, [], WEEK_START)
    expect(occ.totalWorkedMinutes).toBe(0)
  })
})
