import { describe, it, expect } from 'vitest'
import {
  sumProfessionalServicesPay,
  professionalServicesBaseFor,
  type CompletedTherapyForPay,
} from './professional-services'

// Tarifas POR TERAPIA (cost_usd del catálogo), por tipo de servicio.
const COSTS = new Map<string, number>([
  ['lenguaje', 12],
  ['motricidad_gruesa', 15],
  ['psicologica', 20],
])

const T = 'tera-1'
const T2 = 'tera-2'

/** Helper: arma N terapias completadas de un service_type para un terapista. */
function therapies(
  n: number,
  service: string,
  therapist = T,
  isExtra = false,
): CompletedTherapyForPay[] {
  return Array.from({ length: n }, () => ({
    therapist_id: therapist,
    service_type: service,
    is_extra: isExtra,
  }))
}

describe('sumProfessionalServicesPay — pago por CANTIDAD de terapias', () => {
  it('3 terapias de lenguaje ($12 c/u) = 3 × 12 = $36', () => {
    const { all, count } = sumProfessionalServicesPay(therapies(3, 'lenguaje'), COSTS)
    expect(all.get(T)).toBe(36)
    expect(count.get(T)).toBe(3)
  })

  it('suma por tipo de servicio: 2 lenguaje + 1 psicológica = 24 + 20 = $44', () => {
    const data = [...therapies(2, 'lenguaje'), ...therapies(1, 'psicologica')]
    const { all, count } = sumProfessionalServicesPay(data, COSTS)
    expect(all.get(T)).toBe(44)
    expect(count.get(T)).toBe(3)
  })

  it('ES POR CANTIDAD, NO POR HORAS: la duración no es un parámetro; ' +
     '10 terapias de lenguaje pagan 10 × 12 sin importar cuánto duró cada una', () => {
    // Si fuera por horas, una sesión de 90 min pagaría más que una de 30 min.
    // Acá el tipo CompletedTherapyForPay ni siquiera tiene duración: por
    // construcción el pago solo depende de (cantidad × tarifa).
    const { all } = sumProfessionalServicesPay(therapies(10, 'lenguaje'), COSTS)
    expect(all.get(T)).toBe(120) // 10 × $12, no ponderado por horas
  })

  it('mismo conteo y tipos => mismo pago (independiente de cualquier duración real)', () => {
    const a = sumProfessionalServicesPay(therapies(4, 'motricidad_gruesa'), COSTS)
    const b = sumProfessionalServicesPay(therapies(4, 'motricidad_gruesa'), COSTS)
    expect(a.all.get(T)).toBe(b.all.get(T))
    expect(a.all.get(T)).toBe(60) // 4 × $15
  })

  it('service_type sin tarifa en catálogo cuenta como $0 (pero suma al conteo)', () => {
    const { all, count } = sumProfessionalServicesPay(therapies(2, 'sin_tarifa'), COSTS)
    expect(all.get(T)).toBe(0)
    expect(count.get(T)).toBe(2)
  })

  it('separa por terapista', () => {
    const data = [...therapies(2, 'lenguaje', T), ...therapies(1, 'psicologica', T2)]
    const { all } = sumProfessionalServicesPay(data, COSTS)
    expect(all.get(T)).toBe(24)
    expect(all.get(T2)).toBe(20)
  })

  it('ignora citas sin terapista asignado', () => {
    const data: CompletedTherapyForPay[] = [
      { therapist_id: null, service_type: 'lenguaje', is_extra: false },
      ...therapies(1, 'lenguaje'),
    ]
    const { all, count } = sumProfessionalServicesPay(data, COSTS)
    expect(all.get(T)).toBe(12)
    expect(count.get(T)).toBe(1)
  })

  it('acumula `extra` solo con las terapias is_extra', () => {
    const data = [
      ...therapies(3, 'lenguaje', T, false), // normales
      ...therapies(2, 'lenguaje', T, true), // extra/sábado
    ]
    const { all, extra } = sumProfessionalServicesPay(data, COSTS)
    expect(all.get(T)).toBe(60) // 5 × 12
    expect(extra.get(T)).toBe(24) // 2 × 12
  })
})

describe('professionalServicesBaseFor — base según pertenencia', () => {
  const data = [
    ...therapies(4, 'lenguaje', T, false),
    ...therapies(2, 'lenguaje', T, true),
  ]
  const totals = sumProfessionalServicesPay(data, COSTS)

  it('solo-SP (no entra a normal) → paga TODAS las terapias', () => {
    expect(professionalServicesBaseFor(T, false, totals)).toBe(72) // 6 × 12
  })

  it('en ambas (entra a normal) → paga solo las is_extra', () => {
    expect(professionalServicesBaseFor(T, true, totals)).toBe(24) // 2 × 12
  })

  it('terapista sin terapias → base 0', () => {
    expect(professionalServicesBaseFor('nadie', false, totals)).toBe(0)
  })
})
