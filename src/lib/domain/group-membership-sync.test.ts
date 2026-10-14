import { describe, it, expect } from 'vitest'
import {
  planMembershipMoves,
  isCycleMonthInFuture,
  type ActiveMembershipLite,
  type CurrentCycleGroupLite,
} from './group-membership-sync'

const BK1 = 'grupo-bk1'
const BK2 = 'grupo-bk2'

const member = (child_id: string, group_id: string): ActiveMembershipLite => ({ child_id, group_id })
const cycle = (
  child_id: string,
  program_group_id: string | null,
  attendance_days: string[] | null = ['mon', 'tue', 'wed', 'thu', 'fri'],
): CurrentCycleGroupLite => ({ child_id, program_group_id, attendance_days })

describe('planMembershipMoves — la membresía sigue al ciclo del mes en curso', () => {
  it('revierte el salto prematuro: generar noviembre no debe sacar al niño de su grupo de octubre', () => {
    // Caso real (oct 2026): el ciclo de noviembre (BK1) se generó el 12-oct y movió
    // a la membresía de BK2 → BK1 tres semanas antes de tiempo. El ciclo del mes en
    // curso (octubre) sigue diciendo BK2.
    const moves = planMembershipMoves(
      [member('nino-escobar', BK1)],
      [cycle('nino-escobar', BK2)],
    )
    expect(moves).toEqual([
      {
        child_id: 'nino-escobar',
        from_group_id: BK1,
        to_group_id: BK2,
        attendance_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
    ])
  })

  it('aplica el cambio de grupo cuando llega el mes del ciclo nuevo', () => {
    // Ya es noviembre: la membresía quedó en BK2 (octubre) y el ciclo de noviembre dice BK1.
    const moves = planMembershipMoves(
      [member('nino-escobar', BK2)],
      [cycle('nino-escobar', BK1, ['mon', 'wed', 'fri'])],
    )
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({
      child_id: 'nino-escobar',
      from_group_id: BK2,
      to_group_id: BK1,
      attendance_days: ['mon', 'wed', 'fri'],
    })
  })

  it('no hace nada si la membresía ya coincide con el ciclo', () => {
    expect(planMembershipMoves([member('nino-zelaya', BK1)], [cycle('nino-zelaya', BK1)])).toEqual([])
  })

  it('no toca a un niño sin ciclo en el mes en curso', () => {
    // Sin ciclo generado todavía no hay de dónde decidir: se queda donde está.
    expect(planMembershipMoves([member('nino-molina', BK1)], [])).toEqual([])
  })

  it('no resucita a un niño que fue quitado del grupo a mano', () => {
    // "Quitar" en /operacion/grupos deja active=false: no hay membresía activa.
    // El ciclo del mes sigue apuntando al grupo, pero eso no lo vuelve a meter.
    expect(planMembershipMoves([], [cycle('nino-molina', BK1)])).toEqual([])
  })

  it('ignora ciclos sin grupo (terapias individuales, sin programa matutino)', () => {
    expect(planMembershipMoves([member('nino-zelaya', BK1)], [cycle('nino-zelaya', null)])).toEqual([])
  })

  it('conserva los días del niño cuando el ciclo no trae attendance_days', () => {
    const moves = planMembershipMoves([member('nino-escobar', BK1)], [cycle('nino-escobar', BK2, null)])
    expect(moves).toHaveLength(1)
    expect(moves[0].attendance_days).toBeNull()
  })

  it('resuelve cada niño por separado', () => {
    const moves = planMembershipMoves(
      [member('a', BK1), member('b', BK1), member('c', BK2)],
      [cycle('a', BK1), cycle('b', BK2), cycle('c', BK2)],
    )
    expect(moves.map((m) => m.child_id)).toEqual(['b'])
  })

  it('si alguna membresía activa ya coincide con el ciclo, no mueve nada', () => {
    // Estado anómalo (el índice único lo impide), pero no hay que empeorarlo.
    const moves = planMembershipMoves(
      [member('a', BK1), member('a', BK2)],
      [cycle('a', BK2)],
    )
    expect(moves).toEqual([])
  })
})

describe('isCycleMonthInFuture — el mes se mide en zona SV, no en UTC', () => {
  it('un ciclo de noviembre es futuro durante octubre', () => {
    expect(isCycleMonthInFuture('2026-11-01', '2026-10-14T18:00:00.000Z')).toBe(true)
  })

  it('el ciclo del mes en curso no es futuro', () => {
    expect(isCycleMonthInFuture('2026-10-01', '2026-10-14T18:00:00.000Z')).toBe(false)
  })

  it('un ciclo pasado no es futuro', () => {
    expect(isCycleMonthInFuture('2026-09-01', '2026-10-14T18:00:00.000Z')).toBe(false)
  })

  it('en la noche del 31-oct en SV (ya 1-nov en UTC) todavía es octubre', () => {
    // 2026-11-01T03:00Z = 2026-10-31 21:00 en San Salvador (UTC-6). Vercel corre en UTC.
    expect(isCycleMonthInFuture('2026-11-01', '2026-11-01T03:00:00.000Z')).toBe(true)
  })

  it('a la medianoche local del 1-nov ya es noviembre', () => {
    expect(isCycleMonthInFuture('2026-11-01', '2026-11-01T06:00:00.000Z')).toBe(false)
  })

  it('acepta el mes sin día (YYYY-MM)', () => {
    expect(isCycleMonthInFuture('2026-11', '2026-10-14T18:00:00.000Z')).toBe(true)
  })
})
