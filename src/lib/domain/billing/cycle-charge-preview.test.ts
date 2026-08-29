import { describe, it, expect } from 'vitest'
import { buildCycleChargePreview } from './cycle-charge-preview'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

/**
 * Escenario calcado del caso real: BlueKids como mensualidad fija de $170 más
 * tres sesiones de Lenguaje a $22. El mes suma $236.
 */
const THERAPIES = [
  { service: 'blue_kids', active: true, sessions_per_month: 0, unit_cost_usd: 170, billing_mode: 'monthly_flat' },
  { service: 'lenguaje', active: true, sessions_per_month: 3, unit_cost_usd: 22, billing_mode: 'per_session' },
]

function cycle(over: Record<string, unknown> = {}) {
  return {
    id: 'ciclo-sep',
    child_id: 'nino-1',
    period_month: '2026-09-01',
    status: 'generated',
    payment_status: 'pending',
    payment_amount_usd: 236,
    discount_kind: 'none',
    discount_value: 0,
    surcharge_amount_usd: 0,
    billing_adjustment_usd: 0,
    surcharge_carried_in_usd: 0,
    billing_adjustment_carried_in_usd: 0,
    rollover_mode: 'none',
    rollover_discount_usd: 0,
    treatment_plan_snapshot: { therapies_json: THERAPIES, schedule_pattern_json: [] },
    ...over,
  }
}

function tables(over: Partial<FakeTables> = {}): FakeTables {
  return {
    monthly_session_cycles: [cycle()],
    children: [{ id: 'nino-1', full_name: 'Zelaya Molina, Alex', family_id: 'fam-1' }],
    families: [{ id: 'fam-1', late_fee_exempt: false }],
    treatment_plans: [],
    appointments: [],
    ...over,
  }
}

const load = (t: FakeTables) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildCycleChargePreview(createFakeSupabase(t) as any, 'ciclo-sep')

describe('buildCycleChargePreview', () => {
  it('sin arrastres, el total a cobrar es el del mes', async () => {
    const res = await load(tables())

    expect(res?.detail.subtotal).toBe(236)
    expect(res?.carryIns).toEqual([])
    expect(res?.totalToCharge).toBe(236)
  })

  it('devuelve null si el ciclo no existe', async () => {
    const res = await load(tables({ monthly_session_cycles: [] }))

    expect(res).toBeNull()
  })

  it('resta el crédito que arrastra un mes anterior ya pagado', async () => {
    // Agosto se pagó y después se corrigió: quedaron $22 a favor de la familia.
    const res = await load(
      tables({
        monthly_session_cycles: [
          cycle(),
          {
            ...cycle(),
            id: 'ciclo-ago',
            period_month: '2026-08-01',
            payment_status: 'paid',
            billing_adjustment_usd: -22,
            billing_adjustment_carried_at: null,
          },
        ],
      }),
    )

    expect(res?.carryIns).toHaveLength(1)
    expect(res?.carryIns[0].amount).toBe(-22)
    expect(res?.totalToCharge).toBe(214)
  })

  it('suma el recargo por mora de un mes pagado tarde', async () => {
    const res = await load(
      tables({
        monthly_session_cycles: [
          cycle(),
          {
            ...cycle(),
            id: 'ciclo-ago',
            period_month: '2026-08-01',
            payment_status: 'paid',
            surcharge_amount_usd: 12.5,
            surcharge_carried_at: null,
          },
        ],
      }),
    )

    expect(res?.totalToCharge).toBe(248.5)
  })

  it('una familia exonerada no arrastra el recargo', async () => {
    const res = await load(
      tables({
        families: [{ id: 'fam-1', late_fee_exempt: true }],
        monthly_session_cycles: [
          cycle(),
          {
            ...cycle(),
            id: 'ciclo-ago',
            period_month: '2026-08-01',
            payment_status: 'paid',
            surcharge_amount_usd: 12.5,
            surcharge_carried_at: null,
          },
        ],
      }),
    )

    expect(res?.carryIns).toEqual([])
    expect(res?.totalToCharge).toBe(236)
  })

  it('el rollover en modo descuento baja el total y NO está en el monto del ciclo', async () => {
    // `payment_amount_usd` no descuenta el rollover; la factura sí. Por eso el
    // total a cobrar tiene que calcularse aparte y no leerse del ciclo.
    const res = await load(
      tables({
        monthly_session_cycles: [cycle({ rollover_mode: 'discount', rollover_discount_usd: 44 })],
      }),
    )

    expect(res?.detail.subtotal).toBe(236)
    expect(res?.rolloverDiscountUsd).toBe(44)
    expect(res?.totalToCharge).toBe(192)
  })

  it('no marca ningún mes anterior como cobrado: es solo lectura', async () => {
    const t = tables({
      monthly_session_cycles: [
        cycle(),
        {
          ...cycle(),
          id: 'ciclo-ago',
          period_month: '2026-08-01',
          payment_status: 'paid',
          billing_adjustment_usd: -22,
          billing_adjustment_carried_at: null,
        },
      ],
    })
    await load(t)

    const agosto = t.monthly_session_cycles.find((c) => c.id === 'ciclo-ago')
    expect(agosto?.billing_adjustment_carried_at).toBeNull()
  })
})
