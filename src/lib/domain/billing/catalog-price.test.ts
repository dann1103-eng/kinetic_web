import { describe, it, expect } from 'vitest'
import { catalogPriceFor, withCatalogPrices } from './catalog-price'
import type { ServiceCatalogItem, TreatmentPlanTherapyEntry } from '@/types/db'

const catalog = [
  {
    active: true, category: 'terapia_individual', service_type: 'conductual',
    unit_price_usd: 40, unit_price_bk_usd: 30, morning_program: null, days_per_week: null,
  },
  {
    active: true, category: 'terapia_individual', service_type: 'lenguaje',
    unit_price_usd: 25, unit_price_bk_usd: null, morning_program: null, days_per_week: null,
  },
  {
    active: false, category: 'terapia_individual', service_type: 'sensorial',
    unit_price_usd: 20, unit_price_bk_usd: null, morning_program: null, days_per_week: null,
  },
  {
    active: true, category: 'mensualidad', service_type: null,
    unit_price_usd: 170, unit_price_bk_usd: null, morning_program: 'blue_kids', days_per_week: 2,
  },
  {
    active: true, category: 'mensualidad', service_type: null,
    unit_price_usd: 250, unit_price_bk_usd: null, morning_program: 'blue_kids', days_per_week: 5,
  },
] as unknown as ServiceCatalogItem[]

describe('catalogPriceFor', () => {
  it('terapia individual por tipo de servicio', () => {
    expect(catalogPriceFor(catalog, 'lenguaje')).toBe(25)
  })

  it('usa el precio de programa matutino cuando el niño va a uno', () => {
    expect(catalogPriceFor(catalog, 'conductual')).toBe(40)
    expect(catalogPriceFor(catalog, 'conductual', { isMorningChild: true })).toBe(30)
  })

  it('sin precio BK definido se queda con el de lista', () => {
    expect(catalogPriceFor(catalog, 'lenguaje', { isMorningChild: true })).toBe(25)
  })

  it('ignora entradas inactivas del catálogo', () => {
    expect(catalogPriceFor(catalog, 'sensorial')).toBe(0)
  })

  it('mensualidad: elige la variante exacta de días por semana', () => {
    expect(catalogPriceFor(catalog, 'blue_kids', { daysPerWeek: 2 })).toBe(170)
    expect(catalogPriceFor(catalog, 'blue_kids', { daysPerWeek: 5 })).toBe(250)
  })

  it('mensualidad sin variante indicada: la de más días', () => {
    expect(catalogPriceFor(catalog, 'blue_kids')).toBe(250)
  })

  it('servicio desconocido devuelve 0', () => {
    expect(catalogPriceFor(catalog, 'psicometrica')).toBe(0)
  })
})

describe('withCatalogPrices', () => {
  it('rellena solo los precios que vienen en cero', () => {
    const therapies = [
      { service: 'lenguaje', active: true, sessions_per_month: 4, unit_cost_usd: 0 },
      { service: 'conductual', active: true, sessions_per_month: 3, unit_cost_usd: 45 },
    ] as TreatmentPlanTherapyEntry[]
    const res = withCatalogPrices(therapies, catalog)
    expect(res.therapies[0].unit_cost_usd).toBe(25)
    // Un precio ya editado al cobrar manda sobre el de lista.
    expect(res.therapies[1].unit_cost_usd).toBe(45)
    expect(res.filled).toEqual([{ service: 'lenguaje', unitCost: 25 }])
  })

  it('aplica precio de programa matutino si el niño tiene uno en el plan', () => {
    const therapies = [
      { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 0, days_per_week: 2 },
      { service: 'conductual', active: true, sessions_per_month: 3, unit_cost_usd: 0 },
    ] as TreatmentPlanTherapyEntry[]
    const res = withCatalogPrices(therapies, catalog)
    expect(res.therapies[0].unit_cost_usd).toBe(170)
    expect(res.therapies[1].unit_cost_usd).toBe(30)
  })

  it('reporta las terapias que el catálogo tampoco sabe cobrar', () => {
    const therapies = [
      { service: 'psicometrica', active: true, sessions_per_month: 1, unit_cost_usd: 0 },
    ] as TreatmentPlanTherapyEntry[]
    const res = withCatalogPrices(therapies, catalog)
    expect(res.stillUnpriced).toEqual(['psicometrica'])
    expect(res.therapies[0].unit_cost_usd).toBe(0)
  })

  it('no toca terapias inactivas', () => {
    const therapies = [
      { service: 'lenguaje', active: false, sessions_per_month: 4, unit_cost_usd: 0 },
    ] as TreatmentPlanTherapyEntry[]
    const res = withCatalogPrices(therapies, catalog)
    expect(res.therapies[0].unit_cost_usd).toBe(0)
    expect(res.filled).toEqual([])
  })
})
