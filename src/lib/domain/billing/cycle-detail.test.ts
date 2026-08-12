import { describe, it, expect } from 'vitest'
import { buildCycleDetail } from './cycle-detail'
import { billableSessionCounts, therapiesSyncedToAgenda } from './agenda-charge-sync'
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

describe('buildCycleDetail — las filas de costo suman el total', () => {
  /** Plan real reportado: lunes Sensorial+Lenguaje, martes Lenguaje+Conductual. */
  const therapies: TreatmentPlanTherapyEntry[] = [
    { service: 'lenguaje', active: true, sessions_per_month: 7, unit_cost_usd: 25, billing_mode: 'per_session' },
    { service: 'sensorial', active: true, sessions_per_month: 4, unit_cost_usd: 20, billing_mode: 'per_session' },
    { service: 'conductual', active: true, sessions_per_month: 3, unit_cost_usd: 40, billing_mode: 'per_session' },
  ] as TreatmentPlanTherapyEntry[]

  /** Agenda del ciclo (10-ago en adelante) + 1 reposición de conductual el lunes 10. */
  const appointments = [
    ...[10, 17, 24, 31].map((d) => ({ starts_at: `2026-08-${d}T15:00:00-06:00`, service_type: 'lenguaje', status: 'scheduled' })),
    ...[11, 18, 25].map((d) => ({ starts_at: `2026-08-${d}T15:00:00-06:00`, service_type: 'lenguaje', status: 'scheduled' })),
    ...[10, 17, 24, 31].map((d) => ({ starts_at: `2026-08-${d}T16:00:00-06:00`, service_type: 'sensorial', status: 'scheduled' })),
    ...[11, 18, 25].map((d) => ({ starts_at: `2026-08-${d}T16:00:00-06:00`, service_type: 'conductual', status: 'scheduled' })),
    { starts_at: '2026-08-10T17:00:00-06:00', service_type: 'conductual', status: 'replacement' },
  ]

  const input = {
    childName: 'Niño de prueba',
    periodMonth: '2026-08-01',
    therapies,
    schedule: [] as TreatmentPlanScheduleSlot[],
    appointments,
    paymentAmountUsd: 375,
  }

  it('cobra las sesiones del snapshot, no las citas de la agenda', () => {
    const data = buildCycleDetail(input)
    const conductual = data.costRows.find((r) => r.service === 'conductual')
    // La agenda tiene 4 conductuales (3 del patrón + 1 reposición); se cobran 3.
    expect(conductual?.count).toBe(3)
    expect(conductual?.total).toBe(120)
    expect(data.subtotal).toBe(375)
    expect(data.subtotal).toBe(data.total)
  })

  it('la reposición sigue visible en el desglose de fechas, marcada como tal', () => {
    const data = buildCycleDetail(input)
    const conductual = data.therapyBreakdowns.find((b) => b.service === 'conductual')
    expect(conductual?.total).toBe(4)
    expect(conductual?.replacements).toBe(1)
    expect(data.dayHasAppt[10]).toBe(true)
  })

  it('declara la reposición sin costo en las notas', () => {
    const data = buildCycleDetail(input)
    expect(data.agendaNotes).toHaveLength(1)
    expect(data.agendaNotes[0]).toContain('1 sesión de reposición')
  })

  it('caso reportado end-to-end: con la extra sincronizada el PDF cierra en $415', () => {
    // Diana agenda una conductual extra el lunes 10 (no es reposición: la señora
    // la pidió y la paga). El sync sube las sesiones cobradas de 3 a 4.
    const conAgendaExtra = [
      ...appointments.filter((a) => a.status !== 'replacement'),
      { starts_at: '2026-08-10T17:00:00-06:00', service_type: 'conductual', status: 'scheduled' },
    ]
    const synced = therapiesSyncedToAgenda(
      therapies,
      billableSessionCounts(conAgendaExtra.map((a) => ({ ...a, event_type: 'terapia' }))),
      () => 0,
    )
    expect(synced.changed).toBe(true)

    const data = buildCycleDetail({
      ...input,
      therapies: synced.therapies,
      appointments: conAgendaExtra,
      // Lo que el sync deja en payment_amount_usd.
      paymentAmountUsd: 415,
    })
    expect(data.costRows.find((r) => r.service === 'conductual')?.count).toBe(4)
    expect(data.subtotal).toBe(415)
    expect(data.total).toBe(415)
    expect(data.agendaNotes).toEqual([])
  })
})

describe('buildCycleDetail — notas de diferencia agenda ↔ cobro', () => {
  const therapy = (sessions: number): TreatmentPlanTherapyEntry[] =>
    [{ service: 'lenguaje', active: true, sessions_per_month: sessions, unit_cost_usd: 25, billing_mode: 'per_session' }] as TreatmentPlanTherapyEntry[]

  const apptsOn = (days: number[], status = 'scheduled') =>
    days.map((d) => ({ starts_at: `2026-08-${d}T15:00:00-06:00`, service_type: 'lenguaje', status }))

  function build(sessions: number, days: number[]) {
    return buildCycleDetail({
      childName: 'Niño de prueba',
      periodMonth: '2026-08-01',
      therapies: therapy(sessions),
      schedule: [],
      appointments: apptsOn(days),
      paymentAmountUsd: sessions * 25,
    })
  }

  it('sin diferencias no hay notas', () => {
    expect(build(2, [10, 17]).agendaNotes).toEqual([])
  })

  it('avisa cuando la agenda tiene sesiones que no se cobraron', () => {
    const notes = build(2, [10, 17, 24]).agendaNotes
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('1 sesión agendada este mes no está incluida')
  })

  it('avisa cuando se cobraron sesiones que no están en la agenda', () => {
    const notes = build(3, [10, 17]).agendaNotes
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('1 sesión cobrada aún no aparece')
  })

  it('una falta o cancelación no dispara aviso: se cobra igual (rollover la acredita después)', () => {
    const data = buildCycleDetail({
      childName: 'Niño de prueba',
      periodMonth: '2026-08-01',
      therapies: therapy(3),
      schedule: [],
      appointments: [
        ...apptsOn([10, 17]),
        ...apptsOn([24], 'cancelled'),
      ],
      paymentAmountUsd: 75,
    })
    expect(data.agendaNotes).toEqual([])
  })

  it('una mensualidad fija no genera avisos por su cantidad de citas', () => {
    const data = buildCycleDetail({
      childName: 'Niño de prueba',
      periodMonth: '2026-08-01',
      therapies: [
        { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 120, billing_mode: 'monthly_flat' },
      ] as TreatmentPlanTherapyEntry[],
      schedule: [],
      appointments: apptsOn([3, 4, 5]).map((a) => ({ ...a, service_type: 'blue_kids' })),
      paymentAmountUsd: 120,
    })
    expect(data.agendaNotes).toEqual([])
    expect(data.costRows[0].total).toBe(120)
    // Se cobra 1 × mensualidad, aunque el plan traiga sessions_per_month = 0.
    expect(data.costRows[0].count).toBe(1)
  })
})

describe('buildCycleDetail — mes ya pagado y corregido después', () => {
  const therapies = [
    { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 170, billing_mode: 'monthly_flat' },
    { service: 'lenguaje', active: true, sessions_per_month: 3, unit_cost_usd: 22, billing_mode: 'per_session' },
  ] as TreatmentPlanTherapyEntry[]

  const base = {
    childName: 'Niño de prueba',
    periodMonth: '2026-08-01',
    therapies,
    schedule: [] as TreatmentPlanScheduleSlot[],
    appointments: [11, 18, 25].map((d) => ({
      starts_at: `2026-08-${d}T15:00:00-06:00`,
      service_type: 'lenguaje',
      status: 'scheduled',
    })),
  }

  it('el total muestra el detalle corregido, no el monto viejo ya pagado', () => {
    // Pagó $258 (4 sesiones); el detalle se corrigió a 3 → $236.
    const data = buildCycleDetail({
      ...base,
      paymentAmountUsd: 258,
      paymentStatus: 'paid',
      billingAdjustmentUsd: -22,
    })
    expect(data.subtotal).toBe(236)
    expect(data.total).toBe(236)
    expect(data.settlement).toEqual({ paidAmount: 258, adjustment: -22 })
  })

  it('sin ajuste registrado lo deduce del propio detalle', () => {
    const data = buildCycleDetail({ ...base, paymentAmountUsd: 258, paymentStatus: 'paid' })
    expect(data.settlement?.adjustment).toBe(-22)
  })

  it('un mes pagado que sí cuadra no muestra liquidación aparte', () => {
    const data = buildCycleDetail({ ...base, paymentAmountUsd: 236, paymentStatus: 'paid' })
    expect(data.settlement).toBeNull()
    expect(data.total).toBe(236)
  })

  it('un mes PENDIENTE conserva el monto del ciclo como total', () => {
    const data = buildCycleDetail({ ...base, paymentAmountUsd: 258, paymentStatus: 'pending' })
    expect(data.settlement).toBeNull()
    expect(data.total).toBe(258)
  })
})

describe('buildCycleDetail — descuento', () => {
  function withDiscount(kind: string, value: number) {
    return buildCycleDetail({
      childName: 'Niño de prueba',
      periodMonth: '2026-08-01',
      therapies: [
        { service: 'lenguaje', active: true, sessions_per_month: 4, unit_cost_usd: 25, billing_mode: 'per_session' },
      ] as TreatmentPlanTherapyEntry[],
      schedule: [],
      appointments: [],
      paymentAmountUsd: 0,
      discountKind: kind,
      discountValue: value,
    })
  }

  it('porcentual: monto = % del subtotal', () => {
    const data = withDiscount('percent', 10)
    expect(data.subtotal).toBe(100)
    expect(data.discountAmount).toBe(10)
    expect(data.discountLabel).toBe('Descuento 10%')
  })

  it('fijo: se topa al subtotal', () => {
    expect(withDiscount('fixed', 30).discountAmount).toBe(30)
    expect(withDiscount('fixed', 500).discountAmount).toBe(100)
  })

  it('sin descuento el monto es 0', () => {
    expect(withDiscount('none', 0).discountAmount).toBe(0)
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
