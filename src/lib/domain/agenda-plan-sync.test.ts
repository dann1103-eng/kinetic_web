import { describe, it, expect } from 'vitest'
import {
  classifyDrift,
  duplicatePatternSlots,
  duplicateScheduleSlots,
  fullMonthPattern,
  orphanSlotServices,
  planAgendaSync,
  scheduledServices,
  scheduleSignature,
  sessionDeltaByService,
  stripUnplannedServices,
  type AgendaAppt,
  type PatternSlot,
} from './agenda-plan-sync'
import type { TreatmentPlanScheduleSlot, TreatmentPlanTherapyEntry } from '@/types/db'

// Noviembre 2026, zona SV (UTC-6, sin horario de verano): 10:00 SV = 16:00Z.
const NOW = '2026-11-11T16:00:00.000Z' // miércoles 11-nov, 10:00 a.m. SV

const therapy = (
  service: string,
  over: Partial<TreatmentPlanTherapyEntry> = {},
): TreatmentPlanTherapyEntry =>
  ({
    service,
    active: true,
    sessions_per_month: 4,
    unit_cost_usd: 0,
    therapist_id: 'terapista-molina',
    ...over,
  }) as TreatmentPlanTherapyEntry

const slot = (
  service: string,
  day: string,
  time: string,
  over: Partial<TreatmentPlanScheduleSlot> = {},
): TreatmentPlanScheduleSlot =>
  ({
    service,
    day_of_week: day,
    time_local: time,
    duration_minutes: 30,
    frequency: 'weekly',
    ...over,
  }) as TreatmentPlanScheduleSlot

/** Fecha 'YYYY-MM-DD' + hora SV 'HH:MM' → instante ISO. */
const sv = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`).toISOString()

const pat = (service: string, date: string, time: string): PatternSlot => ({
  service,
  starts_at: sv(date, time),
  ends_at: new Date(new Date(sv(date, time)).getTime() + 30 * 60_000).toISOString(),
  duration_minutes: 30,
})

let seq = 0
const appt = (
  service: string,
  date: string,
  time: string,
  over: Partial<AgendaAppt> = {},
): AgendaAppt => ({
  id: `cita-${++seq}`,
  event_type: 'terapia',
  service_type: service,
  starts_at: sv(date, time),
  ends_at: new Date(new Date(sv(date, time)).getTime() + 30 * 60_000).toISOString(),
  status: 'scheduled',
  notes: 'Auto-generado del ciclo 2026-11',
  parent_appointment_id: null,
  suspension_id: null,
  ...over,
})

describe('scheduledServices — qué terapias del plan se agendan por cita', () => {
  it('solo las activas que no son mensualidad fija', () => {
    const set = scheduledServices([
      therapy('lenguaje'),
      therapy('sensorial', { active: false }),
      therapy('blue_kids', { billing_mode: 'monthly_flat', sessions_per_month: 0 }),
    ])
    expect([...set]).toEqual(['lenguaje'])
  })

  it('una terapia activa con cuota 0 sigue contando: la cuota no decide qué se agenda', () => {
    expect([...scheduledServices([therapy('lenguaje', { sessions_per_month: 0 })])]).toEqual([
      'lenguaje',
    ])
  })
})

describe('orphanSlotServices — horarios sin terapia que los respalde', () => {
  it('detecta el horario de una terapia que se quitó del plan', () => {
    // Se reemplazó Funciones Ejecutivas por Conductual cambiando la línea de la
    // terapia, y los horarios viejos quedaron en la programación semanal.
    const orphans = orphanSlotServices(
      [therapy('conductual'), therapy('sensorial')],
      [slot('conductual', 'mon', '14:00'), slot('funciones_ejecutivas', 'wed', '15:00')],
    )
    expect(orphans).toEqual(['funciones_ejecutivas'])
  })

  it('una terapia desactivada también deja su horario huérfano', () => {
    expect(
      orphanSlotServices(
        [therapy('lenguaje', { active: false })],
        [slot('lenguaje', 'tue', '10:00')],
      ),
    ).toEqual(['lenguaje'])
  })

  it('el horario de un programa matutino activo no es huérfano', () => {
    expect(
      orphanSlotServices(
        [therapy('blue_kids', { billing_mode: 'monthly_flat' })],
        [slot('blue_kids', 'mon', '08:00')],
      ),
    ).toEqual([])
  })
})

describe('fullMonthPattern — el patrón que realmente se agenda', () => {
  const therapies = [therapy('lenguaje', { sessions_per_month: 4 })]

  it('incluye lo que la cuota dejaba fuera: el último lunes del mes no se pierde', () => {
    // Noviembre 2026 tiene 5 lunes; la cuota del plan es 4.
    const pattern = fullMonthPattern(
      {
        candidates: ['02', '09', '16', '23'].map((d) => pat('lenguaje', `2026-11-${d}`, '14:00')),
        skipped_overquota: [pat('lenguaje', '2026-11-30', '14:00')],
      },
      therapies,
    )
    expect(pattern.map((p) => p.starts_at.slice(0, 10))).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
  })

  it('NO agenda un horario cuyo servicio ya no es una terapia activa del plan', () => {
    // El RPC manda los horarios sin cuota a skipped_overquota. Sumarlos a ciegas
    // agendaba (y después cobraba) una terapia que el plan ya no tiene.
    const pattern = fullMonthPattern(
      {
        candidates: [pat('lenguaje', '2026-11-16', '14:00')],
        skipped_overquota: [
          pat('funciones_ejecutivas', '2026-11-18', '15:00'),
          pat('funciones_ejecutivas', '2026-11-25', '15:00'),
        ],
      },
      therapies,
    )
    expect(pattern.map((p) => p.service)).toEqual(['lenguaje'])
  })

  it('con nowISO deja solo lo que falta por darse', () => {
    const pattern = fullMonthPattern(
      {
        candidates: ['02', '09', '16', '23'].map((d) => pat('lenguaje', `2026-11-${d}`, '14:00')),
        skipped_overquota: [],
      },
      therapies,
      { nowISO: NOW },
    )
    expect(pattern.map((p) => p.starts_at.slice(0, 10))).toEqual(['2026-11-16', '2026-11-23'])
  })

  it('deja fuera los días de una suspensión avisada', () => {
    const pattern = fullMonthPattern(
      {
        candidates: ['16', '23', '30'].map((d) => pat('lenguaje', `2026-11-${d}`, '14:00')),
        skipped_overquota: [],
      },
      therapies,
      { suspensions: [{ starts_on: '2026-11-20', ends_on: '2026-11-27', status: 'active' }] },
    )
    expect(pattern.map((p) => p.starts_at.slice(0, 10))).toEqual(['2026-11-16', '2026-11-30'])
  })
})

describe('stripUnplannedServices — lo que llega a la previsualización del ciclo', () => {
  const dryRun = {
    candidates: [pat('lenguaje', '2026-11-16', '14:00')],
    skipped_overquota: [
      pat('lenguaje', '2026-11-30', '14:00'),
      pat('funciones_ejecutivas', '2026-11-18', '15:00'),
    ],
    summary: { candidate_count: 1, skipped_overquota_count: 2 },
  }

  it('quita el horario huérfano y avisa cuál fue', () => {
    const { result, unplanned } = stripUnplannedServices(dryRun, [therapy('lenguaje')])
    expect(unplanned).toEqual(['funciones_ejecutivas'])
    expect(result.skipped_overquota.map((c) => c.service)).toEqual(['lenguaje'])
    expect(result.summary.skipped_overquota_count).toBe(1)
  })

  it('si todo es del plan devuelve el mismo objeto, sin tocarlo', () => {
    const { result, unplanned } = stripUnplannedServices(dryRun, [
      therapy('lenguaje'),
      therapy('funciones_ejecutivas'),
    ])
    expect(unplanned).toEqual([])
    expect(result).toBe(dryRun)
  })
})

describe('scheduleSignature — cuándo cambió lo que se agenda', () => {
  const t = [therapy('lenguaje')]

  it('cambiar la semana de un horario quincenal cuenta como cambio', () => {
    const a = scheduleSignature(t, [slot('lenguaje', 'sat', '09:00', { frequency: 'biweekly', biweekly_offset: 0 })])
    const b = scheduleSignature(t, [slot('lenguaje', 'sat', '09:00', { frequency: 'biweekly', biweekly_offset: 1 })])
    expect(a).not.toBe(b)
  })

  it('no cambia si solo se tocó algo que no afecta las citas', () => {
    const a = scheduleSignature(t, [slot('lenguaje', 'sat', '09:00')])
    const b = scheduleSignature(
      [therapy('lenguaje', { unit_cost_usd: 40 })],
      [slot('lenguaje', 'sat', '09:00')],
    )
    expect(a).toBe(b)
  })
})

describe('planAgendaSync — qué citas sobran y cuáles faltan frente al plan', () => {
  const services = new Set(['lenguaje'])
  const run = (expected: PatternSlot[], actual: AgendaAppt[], svc = services) =>
    planAgendaSync(expected, actual, { nowISO: NOW, scheduledServices: svc })

  it('no hace nada cuando la agenda ya coincide con el plan', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00'), pat('lenguaje', '2026-11-24', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00'), appt('lenguaje', '2026-11-24', '10:00')],
    )
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
    expect(plan.kept).toBe(2)
    expect(classifyDrift(plan)).toBe('none')
  })

  it('horario viejo: el plan pasó de martes 10:00 a jueves 14:00 y la agenda no se enteró', () => {
    // Caso reportado: "tiene bien su plan, pero sale agendado en días y horarios
    // diferentes". El ciclo del mes ya estaba generado cuando se editó el plan.
    const old1 = appt('lenguaje', '2026-11-17', '10:00')
    const old2 = appt('lenguaje', '2026-11-24', '10:00')
    const plan = run(
      [pat('lenguaje', '2026-11-12', '14:00'), pat('lenguaje', '2026-11-19', '14:00'), pat('lenguaje', '2026-11-26', '14:00')],
      [old1, old2],
    )
    expect(plan.toCancel.map((c) => [c.appt.id, c.reason])).toEqual([
      [old1.id, 'off_pattern'],
      [old2.id, 'off_pattern'],
    ])
    expect(plan.toCreate.map((c) => c.starts_at.slice(0, 10))).toEqual([
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
    ])
    expect(classifyDrift(plan)).toBe('out_of_plan')
  })

  it('terapia que ya no está en el plan: se cancela y se marca como tal', () => {
    // Caso reportado: "tiene una terapia agendada en ciclo que no corresponde a su plan".
    const ghost = appt('funciones_ejecutivas', '2026-11-18', '15:00')
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00'), ghost],
    )
    expect(plan.toCancel).toEqual([{ appt: ghost, reason: 'not_in_plan' }])
    expect(plan.toCreate).toEqual([])
    expect(classifyDrift(plan)).toBe('out_of_plan')
  })

  it('nunca toca lo que ya pasó ni lo que ya se dio', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-19', '14:00')],
      [
        appt('lenguaje', '2026-11-03', '10:00', { status: 'completed' }),
        appt('lenguaje', '2026-11-10', '10:00'), // ayer, sigue 'scheduled'
        appt('lenguaje', '2026-11-19', '14:00'),
      ],
    )
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
  })

  it('una cita agendada a mano (terapia extra) no se cancela', () => {
    const extra = appt('lenguaje', '2026-11-20', '16:00', { notes: null })
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00'), extra],
    )
    expect(plan.toCancel).toEqual([])
    expect(classifyDrift(plan)).toBe('none')
  })

  it('una reposición no se cancela, y si cae en un horario del plan no se le agenda otra encima', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00', { status: 'replacement', notes: null })],
    )
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
  })

  it('una sesión que la familia canceló no se vuelve a agendar', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00', { status: 'cancelled', notes: 'Cancelada por enfermedad' })],
    )
    expect(plan.toCreate).toEqual([])
  })

  it('las citas que se cancelaron por una pausa SÍ se reponen cuando el niño vuelve', () => {
    // Pausar cancela todo lo futuro; reanudar no restauraba nada y el niño
    // "no aparecía en la calendarización" aunque tuviera plan y ciclo.
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00'), pat('lenguaje', '2026-11-24', '10:00')],
      [
        appt('lenguaje', '2026-11-17', '10:00', {
          status: 'cancelled',
          notes: 'Cancelada automáticamente por cambio de fase a Pausa temporal.',
        }),
      ],
    )
    expect(plan.toCreate.map((c) => c.starts_at.slice(0, 10))).toEqual(['2026-11-17', '2026-11-24'])
    expect(classifyDrift(plan)).toBe('missing_only')
  })

  it('una cita reagendada a mano se respeta: ni se cancela ni se repone su horario original', () => {
    const tomb = appt('lenguaje', '2026-11-17', '10:00', { status: 'rescheduled' })
    const moved = appt('lenguaje', '2026-11-18', '11:00', { parent_appointment_id: tomb.id })
    const plan = run([pat('lenguaje', '2026-11-17', '10:00')], [tomb, moved])
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
  })

  it('una lápida sola (cita regenerada) no cuenta como cita: su horario se repone', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00', { status: 'rescheduled' })],
    )
    expect(plan.toCreate).toHaveLength(1)
  })

  it('citas duplicadas en el mismo horario: queda una', () => {
    const a = appt('lenguaje', '2026-11-17', '10:00')
    const b = appt('lenguaje', '2026-11-17', '10:00')
    const plan = run([pat('lenguaje', '2026-11-17', '10:00')], [a, b])
    expect(plan.kept).toBe(1)
    expect(plan.toCancel).toEqual([{ appt: b, reason: 'duplicate' }])
  })

  it('no toca las citas de programa matutino ni las de una suspensión', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [
        appt('lenguaje', '2026-11-17', '10:00'),
        appt('blue_kids', '2026-11-17', '08:00', { event_type: 'programa_matutino' }),
        appt('lenguaje', '2026-11-24', '10:00', { status: 'cancelled', suspension_id: 'susp-1' }),
      ],
    )
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
  })

  it('si el plan solo cambió la duración, se corrige la misma cita en vez de recrearla', () => {
    // El plan pasó la sesión de 30 a 60 minutos, mismo día y hora.
    const a = appt('lenguaje', '2026-11-17', '10:00')
    const sixty = { ...pat('lenguaje', '2026-11-17', '10:00'), ends_at: sv('2026-11-17', '11:00'), duration_minutes: 60 }
    const plan = run([sixty], [a])
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toEqual([])
    expect(plan.toResize).toEqual([{ appt: a, ends_at: sv('2026-11-17', '11:00') }])
    expect(classifyDrift(plan)).toBe('out_of_plan')
  })

  it('una sola cita movida de día es un desfase puntual, no un horario viejo', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00'), pat('lenguaje', '2026-11-24', '10:00')],
      [appt('lenguaje', '2026-11-18', '10:00'), appt('lenguaje', '2026-11-24', '10:00')],
    )
    expect(plan.toCancel).toHaveLength(1)
    expect(plan.toCreate).toHaveLength(1)
    expect(classifyDrift(plan)).toBe('moved')
  })
})

describe('classifyDrift — no toda diferencia se corrige igual', () => {
  // Casos tomados de la primera revisión real de noviembre 2026 (nombres ficticios).
  const run = (expected: PatternSlot[], actual: AgendaAppt[], svc: string[]) =>
    planAgendaSync(expected, actual, { nowISO: NOW, scheduledServices: new Set(svc) })

  it('horario viejo aunque otro día de la misma terapia esté bien: hay que corregirlo', () => {
    // Familia Zelaya: el plan pasó el jueves a viernes y dejó el lunes igual. La
    // agenda quedó lunes (bien) + jueves (viejo). Que el lunes coincida no lo
    // vuelve una "diferencia puntual": son seis citas en un día que el plan no tiene.
    const plan = run(
      [
        ...['16', '23', '30'].map((d) => pat('sensorial', `2026-11-${d}`, '14:30')),
        ...['13', '20', '27'].map((d) => pat('sensorial', `2026-11-${d}`, '14:30')),
      ],
      [
        ...['16', '23'].map((d) => appt('sensorial', `2026-11-${d}`, '14:30')),
        ...['12', '19', '26'].map((d) => appt('sensorial', `2026-11-${d}`, '16:00')),
      ],
      ['sensorial'],
    )
    expect(plan.toCancel).toHaveLength(3)
    expect(classifyDrift(plan)).toBe('out_of_plan')
  })

  it('mismo día y hora pero otra semana: NO se corrige solo, hay que mirar el plan', () => {
    // Niño quincenal. La agenda lo tiene el 2º y 4º sábado (14 y 28); el plan dice
    // 1º y 3º (7 y 21). Hasta nov 2026 el plan perdía esa elección al guardarse,
    // así que lo más probable es que la agenda esté bien y el plan mal: sincronizar
    // lo pasaría a las semanas equivocadas.
    const plan = run(
      [pat('psicologica', '2026-11-21', '11:30')],
      [appt('psicologica', '2026-11-14', '11:30'), appt('psicologica', '2026-11-28', '11:30')],
      ['psicologica'],
    )
    expect(plan.toCancel).toHaveLength(2)
    expect(plan.toCreate).toHaveLength(1)
    expect(classifyDrift(plan)).toBe('week_shift')
  })

  it('agenda semanal con plan quincenal también es un tema de semanas', () => {
    const plan = run(
      [pat('psicologica', '2026-11-21', '11:30')],
      [
        appt('psicologica', '2026-11-14', '11:30'),
        appt('psicologica', '2026-11-21', '11:30'),
        appt('psicologica', '2026-11-28', '11:30'),
      ],
      ['psicologica'],
    )
    expect(plan.kept).toBe(1)
    expect(classifyDrift(plan)).toBe('week_shift')
  })

  it('solo faltan citas: puede ser a propósito, no se agregan solas', () => {
    // El plan es semanal pero al niño le quitaron citas al generar el ciclo
    // (viene semana de por medio). No hay nada mal agendado: solo "faltan".
    const plan = run(
      ['13', '20', '27'].map((d) => pat('lenguaje', `2026-11-${d}`, '13:30')),
      [appt('lenguaje', '2026-11-20', '13:30')],
      ['lenguaje'],
    )
    expect(plan.toCancel).toEqual([])
    expect(plan.toCreate).toHaveLength(2)
    expect(classifyDrift(plan)).toBe('missing_only')
  })

  it('dos terapias intercambiadas un solo día es una cita movida', () => {
    const plan = run(
      [
        pat('sensorial', '2026-11-12', '14:30'),
        pat('lenguaje', '2026-11-12', '15:00'),
        pat('sensorial', '2026-11-19', '14:30'),
        pat('lenguaje', '2026-11-19', '15:00'),
      ],
      [
        appt('lenguaje', '2026-11-12', '14:30'),
        appt('sensorial', '2026-11-12', '15:00'),
        appt('sensorial', '2026-11-19', '14:30'),
        appt('lenguaje', '2026-11-19', '15:00'),
      ],
      ['sensorial', 'lenguaje'],
    )
    expect(plan.toCancel).toHaveLength(2)
    expect(classifyDrift(plan)).toBe('moved')
  })

  it('una cita duplicada siempre es un error', () => {
    const plan = run(
      [pat('lenguaje', '2026-11-17', '10:00')],
      [appt('lenguaje', '2026-11-17', '10:00'), appt('lenguaje', '2026-11-17', '10:00')],
      ['lenguaje'],
    )
    expect(classifyDrift(plan)).toBe('out_of_plan')
  })
})

describe('horarios repetidos en el plan', () => {
  // Caso real (nov 2026): un plan con "viernes 15:00 · Refuerzo" cargado DOS veces
  // (el segundo debía ser 15:30). Sincronizar desde ese plan dejaba una sola cita
  // por viernes en vez de dos — la mitad de las sesiones contratadas.
  it('detecta dos horarios idénticos en la programación semanal', () => {
    const dups = duplicateScheduleSlots([
      slot('lenguaje', 'mon', '14:00'),
      slot('refuerzo_academico', 'fri', '15:00'),
      slot('refuerzo_academico', 'fri', '15:00'),
    ])
    expect(dups).toEqual([{ service: 'refuerzo_academico', day_of_week: 'fri', time_local: '15:00' }])
  })

  it('dos quincenales en semanas distintas NO son un repetido (equivalen a semanal)', () => {
    expect(
      duplicateScheduleSlots([
        slot('lenguaje', 'sat', '09:00', { frequency: 'biweekly', biweekly_offset: 0 }),
        slot('lenguaje', 'sat', '09:00', { frequency: 'biweekly', biweekly_offset: 1 }),
      ]),
    ).toEqual([])
  })

  it('un semanal y un quincenal a la misma hora sí chocan', () => {
    expect(
      duplicateScheduleSlots([
        slot('lenguaje', 'sat', '09:00'),
        slot('lenguaje', 'sat', '09:00', { frequency: 'biweekly', biweekly_offset: 1 }),
      ]),
    ).toHaveLength(1)
  })

  it('misma hora pero otra terapia no es un repetido', () => {
    expect(
      duplicateScheduleSlots([slot('lenguaje', 'mon', '14:00'), slot('sensorial', 'mon', '14:00')]),
    ).toEqual([])
  })

  it('en el patrón del mes: dos citas de la misma terapia en el mismo instante', () => {
    const dups = duplicatePatternSlots([
      pat('refuerzo_academico', '2026-11-13', '15:00'),
      pat('refuerzo_academico', '2026-11-13', '15:00'),
      pat('lenguaje', '2026-11-16', '14:00'),
    ])
    expect(dups.map((d) => d.service)).toEqual(['refuerzo_academico'])
  })
})

describe('sessionDeltaByService — cuántas sesiones cambia la sincronización', () => {
  it('mover una terapia de día no cambia la cantidad', () => {
    expect(
      sessionDeltaByService({
        cancel: [{ service: 'sensorial' }, { service: 'sensorial' }],
        create: [{ service: 'sensorial' }, { service: 'sensorial' }],
      }),
    ).toEqual([])
  })

  it('avisa cuando el mes queda con más o menos sesiones de una terapia', () => {
    // Al pasar el jueves a viernes, el plan además trae un quinto lunes que el
    // ciclo no tenía: son 2 sesiones más, y el cobro del mes las suma.
    expect(
      sessionDeltaByService({
        cancel: [{ service: 'lenguaje' }, { service: 'lenguaje' }, { service: 'lenguaje' }],
        create: [{ service: 'sensorial' }, { service: 'conductual' }],
      }),
    ).toEqual([
      { service: 'conductual', delta: 1 },
      { service: 'lenguaje', delta: -3 },
      { service: 'sensorial', delta: 1 },
    ])
  })
})
