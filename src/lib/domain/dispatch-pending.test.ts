import { describe, it, expect } from 'vitest'
import { fetchPendingDispatches } from './dispatch-pending'
import { createFakeSupabase, type FakeTables } from '@/lib/supabase/testing'

const COMPLETED_AT = '2026-11-17T20:10:00.000Z'

let seq = 0
/** Cita completada, sin despachar y sin pasar por recepción (lo que dispara el pop-up). */
function appt(over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: 'a-' + seq,
    child_id: 'nino-zelaya',
    therapist_id: 'terapista-1',
    event_type: 'terapia',
    status: 'completed',
    completed_at: COMPLETED_AT,
    dispatched_at: null,
    dispatch_type: null,
    dispatch_snoozed_until: null,
    ...over,
  }
}

const tables = (appointments: Record<string, unknown>[]): FakeTables => ({
  appointments,
  children: [{ id: 'nino-zelaya', full_name: 'Zelaya Molina, Alex' }],
})

const load = (t: FakeTables, scope = { actorId: 'directora-1', seesAll: true }) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchPendingDispatches(createFakeSupabase(t) as any, scope)

describe('fetchPendingDispatches', () => {
  it('lista la terapia completada de un niño que aún no se despacha, con su nombre', async () => {
    const res = await load(tables([appt()]))
    expect(res).toHaveLength(1)
    expect(res[0].child_name).toBe('Zelaya Molina, Alex')
  })

  // Reunión de padres, entrega de avances, entrevista, evaluación a una persona
  // nueva, "otro": `completeFreePerson` las deja en `completed` + `completed_at` con
  // child_id NULL y NADA las despacha jamás. Sin niño no hay a quién recoger: el
  // pop-up "¿Niño/a sigue ahí?" salía igual, sin nombre, a la directora y a las
  // coordinadoras (117 casos en prod, todos cerrados a mano a los ≥15 min).
  it('NO lista una cita sin niño (evaluación, reunión, entrevista…)', async () => {
    const t = tables([
      appt({ child_id: null, event_type: 'reunion_padres' }),
      appt({ child_id: null, event_type: 'evaluacion' }),
      appt({ child_id: null, event_type: 'otro' }),
    ])
    expect(await load(t)).toEqual([])
  })

  it('con una cita sin niño y una terapia pendientes, solo devuelve la terapia', async () => {
    const t = tables([appt({ child_id: null, event_type: 'entrega_avances' }), appt()])
    const res = await load(t)
    expect(res).toHaveLength(1)
    expect(res[0].child_name).toBe('Zelaya Molina, Alex')
  })

  it('no lista las ya despachadas ni las que están en recepción', async () => {
    const t = tables([
      appt({ dispatched_at: '2026-11-17T20:12:00.000Z', dispatch_type: 'to_parent' }),
      appt({ dispatch_type: 'to_reception' }),
    ])
    expect(await load(t)).toEqual([])
  })

  it('una terapista solo ve sus propias citas; gestión ve las de todas', async () => {
    const t = tables([appt({ therapist_id: 'terapista-1' }), appt({ therapist_id: 'terapista-2' })])
    expect(await load(t, { actorId: 'terapista-1', seesAll: false })).toHaveLength(1)
    expect(await load(t, { actorId: 'directora-1', seesAll: true })).toHaveLength(2)
  })
})
