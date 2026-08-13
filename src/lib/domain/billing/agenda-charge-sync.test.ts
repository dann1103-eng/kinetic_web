import { describe, it, expect } from 'vitest'
import {
  billableSessionCounts,
  periodMonthOfSV,
  therapiesSyncedToAgenda,
} from './agenda-charge-sync'
import type { TreatmentPlanTherapyEntry } from '@/types/db'

const appt = (service: string, status = 'scheduled', event_type = 'terapia') => ({
  service_type: service,
  status,
  event_type,
})

describe('billableSessionCounts', () => {
  it('cuenta las citas programadas por servicio', () => {
    const counts = billableSessionCounts([
      appt('conductual'),
      appt('conductual'),
      appt('lenguaje'),
    ])
    expect(counts.get('conductual')).toBe(2)
    expect(counts.get('lenguaje')).toBe(1)
  })

  it('NO cuenta las reposiciones (reponen una falta ya cobrada)', () => {
    const counts = billableSessionCounts([appt('conductual'), appt('conductual', 'replacement')])
    expect(counts.get('conductual')).toBe(1)
  })

  it('NO cuenta las lápidas de citas movidas o regeneradas', () => {
    const counts = billableSessionCounts([appt('lenguaje'), appt('lenguaje', 'rescheduled')])
    expect(counts.get('lenguaje')).toBe(1)
  })

  it('SÍ cuenta faltas y cancelaciones: se cobran y se acreditan por rollover', () => {
    const counts = billableSessionCounts([
      appt('lenguaje', 'no_show'),
      appt('lenguaje', 'late_cancel'),
      appt('lenguaje', 'cancelled'),
      appt('lenguaje', 'completed'),
    ])
    expect(counts.get('lenguaje')).toBe(4)
  })

  it('ignora programas matutinos (mensualidad fija) y eventos que no son terapia', () => {
    const counts = billableSessionCounts([
      appt('blue_kids', 'scheduled', 'programa_matutino'),
      appt('blue_kids'),
      appt('lenguaje', 'scheduled', 'evaluacion'),
    ])
    expect(counts.size).toBe(0)
  })
})

describe('periodMonthOfSV', () => {
  it('usa la hora de El Salvador, no UTC', () => {
    // 2026-09-01T02:00Z = 31-ago 20:00 en SV → pertenece a agosto.
    expect(periodMonthOfSV('2026-09-01T02:00:00Z')).toBe('2026-08-01')
    expect(periodMonthOfSV('2026-08-10T22:00:00Z')).toBe('2026-08-01')
  })
})

describe('therapiesSyncedToAgenda', () => {
  const plan = (): TreatmentPlanTherapyEntry[] =>
    [
      { service: 'lenguaje', active: true, sessions_per_month: 7, unit_cost_usd: 25, billing_mode: 'per_session' },
      { service: 'conductual', active: true, sessions_per_month: 3, unit_cost_usd: 40, billing_mode: 'per_session' },
    ] as TreatmentPlanTherapyEntry[]

  const noPrice = () => 0

  it('el caso reportado: la terapia extra sube las sesiones cobradas', () => {
    const counts = new Map([['lenguaje', 7], ['conductual', 4]])
    const res = therapiesSyncedToAgenda(plan(), counts, noPrice)
    expect(res.changed).toBe(true)
    expect(res.therapies.find((t) => t.service === 'conductual')?.sessions_per_month).toBe(4)
    expect(res.therapies.find((t) => t.service === 'lenguaje')?.sessions_per_month).toBe(7)
  })

  it('es idempotente: si la agenda ya coincide, no marca cambios', () => {
    const counts = new Map([['lenguaje', 7], ['conductual', 3]])
    expect(therapiesSyncedToAgenda(plan(), counts, noPrice).changed).toBe(false)
  })

  it('borrar una cita baja las sesiones cobradas', () => {
    const counts = new Map([['lenguaje', 7], ['conductual', 2]])
    const res = therapiesSyncedToAgenda(plan(), counts, noPrice)
    expect(res.therapies.find((t) => t.service === 'conductual')?.sessions_per_month).toBe(2)
  })

  it('un servicio sin citas en el mes NO se pone en cero', () => {
    // Anular la agenda del ciclo no debe vaciar el cobro en silencio.
    const res = therapiesSyncedToAgenda(plan(), new Map([['lenguaje', 7]]), noPrice)
    expect(res.therapies.find((t) => t.service === 'conductual')?.sessions_per_month).toBe(3)
  })

  it('no toca las mensualidades fijas ni las terapias inactivas', () => {
    const therapies = [
      { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 120, billing_mode: 'monthly_flat' },
      { service: 'sensorial', active: false, sessions_per_month: 4, unit_cost_usd: 20, billing_mode: 'per_session' },
    ] as TreatmentPlanTherapyEntry[]
    const counts = new Map([['blue_kids', 12], ['sensorial', 9]])
    const res = therapiesSyncedToAgenda(therapies, counts, noPrice)
    expect(res.changed).toBe(false)
    expect(res.therapies[0].sessions_per_month).toBe(0)
    expect(res.therapies[1].sessions_per_month).toBe(4)
  })

  it('una terapia fuera del plan se agrega con el precio del catálogo', () => {
    const counts = new Map([['lenguaje', 7], ['conductual', 3], ['sensorial', 1]])
    const res = therapiesSyncedToAgenda(plan(), counts, (s) => (s === 'sensorial' ? 20 : 0))
    expect(res.changed).toBe(true)
    const added = res.therapies.find((t) => t.service === 'sensorial')
    expect(added).toMatchObject({ sessions_per_month: 1, unit_cost_usd: 20, active: true })
    expect(res.unpricedServices).toEqual([])
  })

  it('una terapia del plan SIN precio lo toma del catálogo', () => {
    // El snapshot de un ciclo copia el plan, y el plan ya no guarda precios: sin
    // este respaldo, recalcular el monto daba $0 y borraba el cobro del mes.
    const sinPrecio = [
      { service: 'conductual', active: true, sessions_per_month: 6, unit_cost_usd: 0, billing_mode: 'per_session' },
    ] as TreatmentPlanTherapyEntry[]
    const res = therapiesSyncedToAgenda(sinPrecio, new Map([['conductual', 6]]), () => 40)
    expect(res.changed).toBe(true)
    expect(res.therapies[0].unit_cost_usd).toBe(40)
    expect(res.therapies[0].sessions_per_month).toBe(6)
    expect(res.backfilledPrices).toEqual([{ service: 'conductual', unitCost: 40 }])
  })

  it('una mensualidad fija sin precio también lo toma del catálogo', () => {
    const flat = [
      { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 0, billing_mode: 'monthly_flat' },
    ] as TreatmentPlanTherapyEntry[]
    const res = therapiesSyncedToAgenda(flat, new Map([['lenguaje', 2]]), () => 170)
    expect(res.therapies[0].unit_cost_usd).toBe(170)
  })

  it('si el catálogo tampoco tiene precio, lo reporta y deja el cero', () => {
    const sinPrecio = [
      { service: 'conductual', active: true, sessions_per_month: 6, unit_cost_usd: 0, billing_mode: 'per_session' },
    ] as TreatmentPlanTherapyEntry[]
    const res = therapiesSyncedToAgenda(sinPrecio, new Map([['conductual', 6]]), () => 0)
    expect(res.unpricedServices).toEqual(['conductual'])
    expect(res.therapies[0].unit_cost_usd).toBe(0)
  })

  it('una terapia sin precio de catálogo no se cobra y se reporta', () => {
    const counts = new Map([['lenguaje', 7], ['conductual', 3], ['sensorial', 1]])
    const res = therapiesSyncedToAgenda(plan(), counts, noPrice)
    expect(res.changed).toBe(false)
    expect(res.therapies).toHaveLength(2)
    expect(res.unpricedServices).toEqual(['sensorial'])
  })
})
