import { describe, it, expect } from 'vitest'
import { isResumingTreatment, validateTransition } from './intake-pipeline'
import type { IntakePhaseCatalogEntry, PhaseGroupNumber } from '@/types/db'

// Espejo del seed de la mig 0121: [code, grupo, sub_order, sort_order, flags].
const SEED: Array<
  [string, PhaseGroupNumber, number, number, Partial<IntakePhaseCatalogEntry>?]
> = [
  ['1_1_contacto_inicial', 1, 1, 11],
  ['1_2_informacion_enviada', 1, 2, 12],
  ['1_3_entrevista_agendada', 1, 3, 13],
  ['2_1_entrevista_conocimiento', 2, 1, 21],
  ['2_2_observacion_clinica', 2, 2, 22],
  ['2_3_observacion_escolar', 2, 3, 23, { is_optional: true }],
  ['2_4_propuesta_evaluacion', 2, 4, 24],
  ['2_5_evaluacion_en_proceso', 2, 5, 25],
  ['2_6_levantamiento_informes', 2, 6, 26],
  ['2_7_informes_entregados', 2, 7, 27],
  ['3_1_propuesta_terapeutica', 3, 1, 31],
  ['3_2_inscripcion_activa', 3, 2, 32, { creates_child: true }],
  ['3_3_activo_en_terapias', 3, 3, 33],
  ['4_1_pausa_temporal', 4, 1, 41, { cancels_future_appointments: true }],
  ['4_2_seguimiento_pendiente', 4, 2, 42, { cancels_future_appointments: true }],
  ['5_1_alta_terapeutica', 5, 1, 51, { is_terminal: true, cancels_future_appointments: true }],
  ['5_2_retirado', 5, 2, 52, { is_terminal: true, cancels_future_appointments: true }],
]

const catalog: IntakePhaseCatalogEntry[] = SEED.map(
  ([code, group_number, sub_order, sort_order, flags]) => ({
    code,
    group_number,
    group_name: `Grupo ${group_number}`,
    sub_order,
    label: code,
    description: null,
    is_optional: false,
    is_waitlist_visible: group_number <= 2,
    is_terminal: false,
    creates_child: false,
    cancels_future_appointments: false,
    active: true,
    sort_order,
    created_at: '2026-01-01T00:00:00Z',
    ...flags,
  }),
)

const ACTIVO = '3_3_activo_en_terapias'
const PAUSA = '4_1_pausa_temporal'
const SEGUIMIENTO = '4_2_seguimiento_pendiente'

describe('validateTransition — reanudar no es retroceder', () => {
  it('la coordinadora reanuda a un niño que estaba en pausa', () => {
    const res = validateTransition(PAUSA, ACTIVO, catalog, 'coordinadora_terapias')
    expect(res.allowed).toBe(true)
    expect(res.warning).toBeUndefined()
    expect(res.side_effects).toEqual([])
  })

  it('también desde seguimiento pendiente', () => {
    expect(validateTransition(SEGUIMIENTO, ACTIVO, catalog, 'coordinadora_familias').allowed).toBe(true)
  })

  it('quien puede pausar puede reanudar', () => {
    for (const role of ['terapista', 'recepcion', 'supervisor'] as const) {
      expect(validateTransition(ACTIVO, PAUSA, catalog, role).allowed).toBe(true)
      expect(validateTransition(PAUSA, ACTIVO, catalog, role).allowed).toBe(true)
    }
  })

  it('pasar de seguimiento a pausa sigue pidiendo cancelar las citas futuras', () => {
    const res = validateTransition(SEGUIMIENTO, PAUSA, catalog, 'coordinadora_terapias')
    expect(res.allowed).toBe(true)
    expect(res.side_effects).toEqual([
      { type: 'cancel_future_appointments', requires_confirmation: true },
    ])
  })

  it('un rol que no cambia fases tampoco reanuda', () => {
    expect(validateTransition(PAUSA, ACTIVO, catalog, 'contable').allowed).toBe(false)
  })
})

describe('validateTransition — lo que sigue siendo solo de dirección', () => {
  const RETROCESOS: Array<[string, string]> = [
    ['2_4_propuesta_evaluacion', '2_1_entrevista_conocimiento'],
    [ACTIVO, '3_1_propuesta_terapeutica'],
    // De tratamiento hacia admisión no es reanudar: es deshacer el ingreso.
    [PAUSA, '3_1_propuesta_terapeutica'],
    [SEGUIMIENTO, '3_2_inscripcion_activa'],
  ]

  it('la coordinadora no retrocede fases de admisión', () => {
    for (const [from, to] of RETROCESOS) {
      const res = validateTransition(from, to, catalog, 'coordinadora_terapias')
      expect(res.allowed, `${from} → ${to}`).toBe(false)
      expect(res.reason).toBe('Solo admin/directora puede retroceder fases.')
    }
  })

  it('la coordinadora no reabre un alta ni un retiro, ni siquiera hacia activo', () => {
    for (const from of ['5_1_alta_terapeutica', '5_2_retirado']) {
      const res = validateTransition(from, ACTIVO, catalog, 'coordinadora_terapias')
      expect(res.allowed, from).toBe(false)
      expect(res.reason).toBe('Solo admin/directora puede reabrir desde una fase terminal.')
    }
  })

  it('admin y directora conservan todo', () => {
    for (const role of ['admin', 'directora'] as const) {
      for (const [from, to] of RETROCESOS) {
        expect(validateTransition(from, to, catalog, role).allowed, `${from} → ${to}`).toBe(true)
      }
      expect(validateTransition('5_2_retirado', ACTIVO, catalog, role).allowed).toBe(true)
    }
  })
})

describe('isResumingTreatment', () => {
  it('es reanudar cuando vuelve a activo desde pausa o seguimiento', () => {
    expect(isResumingTreatment(PAUSA, ACTIVO)).toBe(true)
    expect(isResumingTreatment(SEGUIMIENTO, ACTIVO)).toBe(true)
  })

  it('el primer ingreso a activo no es reanudar', () => {
    expect(isResumingTreatment('3_2_inscripcion_activa', ACTIVO)).toBe(false)
    expect(isResumingTreatment(null, ACTIVO)).toBe(false)
  })

  it('reabrir un cierre no es reanudar', () => {
    expect(isResumingTreatment('5_2_retirado', ACTIVO)).toBe(false)
  })

  it('moverse entre pausa y seguimiento no es reanudar', () => {
    expect(isResumingTreatment(SEGUIMIENTO, PAUSA)).toBe(false)
    expect(isResumingTreatment(ACTIVO, PAUSA)).toBe(false)
  })
})
