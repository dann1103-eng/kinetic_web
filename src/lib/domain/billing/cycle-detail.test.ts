import { describe, it, expect } from 'vitest'
import { buildCycleDetail } from './cycle-detail'
import type { TreatmentPlanScheduleSlot, TreatmentPlanTherapyEntry } from '@/types/db'

function baseInput(schedule: TreatmentPlanScheduleSlot[]) {
  const therapies: TreatmentPlanTherapyEntry[] = [
    {
      service: 'psicologica',
      active: true,
      sessions_per_month: schedule.length,
      unit_cost_usd: 40,
      billing_mode: 'per_session',
    } as TreatmentPlanTherapyEntry,
  ]
  return {
    childName: 'Niño de prueba',
    periodMonth: '2026-08-01',
    therapies,
    schedule,
    appointments: [],
    paymentAmountUsd: 80,
  }
}

describe('buildCycleDetail — weeklyPlan', () => {
  it('no agrega columnas de fin de semana si el plan es solo entre semana', () => {
    const schedule: TreatmentPlanScheduleSlot[] = [
      { day_of_week: 'mon', time_local: '15:00', duration_minutes: 30, service: 'psicologica' },
    ]
    const data = buildCycleDetail(baseInput(schedule))
    expect(data.weeklyPlan.map((c) => c.dow)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })

  it('agrega la columna de sábado cuando el plan tiene una terapia ese día', () => {
    const schedule: TreatmentPlanScheduleSlot[] = [
      { day_of_week: 'sat', time_local: '10:00', duration_minutes: 30, service: 'psicologica' },
    ]
    const data = buildCycleDetail(baseInput(schedule))
    expect(data.weeklyPlan.map((c) => c.dow)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    const satCell = data.weeklyPlan.find((c) => c.dow === 'sat')
    expect(satCell?.dowLabel).toBe('Sábado')
    expect(satCell?.therapies).toContain('Psicológica')
  })

  it('agrega ambas columnas de fin de semana si el plan usa sábado y domingo', () => {
    const schedule: TreatmentPlanScheduleSlot[] = [
      { day_of_week: 'sat', time_local: '10:00', duration_minutes: 30, service: 'psicologica' },
      { day_of_week: 'sun', time_local: '10:00', duration_minutes: 30, service: 'psicologica' },
    ]
    const data = buildCycleDetail(baseInput(schedule))
    expect(data.weeklyPlan.map((c) => c.dow)).toEqual([
      'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
    ])
  })
})

describe('buildCycleDetail — costRows.durationMinutes', () => {
  it('toma la duración real del patrón de horario de esa terapia', () => {
    const schedule: TreatmentPlanScheduleSlot[] = [
      { day_of_week: 'sat', time_local: '10:00', duration_minutes: 60, service: 'ils_escucha' },
    ]
    const input = {
      ...baseInput(schedule),
      therapies: [
        {
          service: 'ils_escucha',
          active: true,
          sessions_per_month: 1,
          unit_cost_usd: 60,
          billing_mode: 'per_session',
        } as TreatmentPlanTherapyEntry,
      ],
    }
    const data = buildCycleDetail(input)
    expect(data.costRows[0].durationMinutes).toBe(60)
  })

  it('es null para mensualidades planas (programas matutinos)', () => {
    const input = {
      ...baseInput([]),
      therapies: [
        {
          service: 'blue_kids',
          active: true,
          sessions_per_month: 0,
          unit_cost_usd: 120,
          billing_mode: 'monthly_flat',
        } as TreatmentPlanTherapyEntry,
      ],
    }
    const data = buildCycleDetail(input)
    expect(data.costRows[0].durationMinutes).toBeNull()
  })
})

describe('buildCycleDetail — therapyBreakdowns ordena sábado después de viernes', () => {
  it('una cita de sábado no se ordena antes que lunes en el desglose', () => {
    const input = {
      ...baseInput([]),
      appointments: [
        // 2026-08-03 es lunes; 2026-08-01 es sábado (mismo mes del período).
        { starts_at: '2026-08-03T15:00:00-06:00', service_type: 'psicologica', status: 'completed' },
        { starts_at: '2026-08-01T10:00:00-06:00', service_type: 'psicologica', status: 'completed' },
      ],
    }
    const data = buildCycleDetail(input)
    const days = data.therapyBreakdowns[0].days.map((d) => d.dow)
    expect(days).toEqual(['mon', 'sat'])
  })
})
