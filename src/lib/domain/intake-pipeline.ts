// ──────────────────────────────────────────────────────────────────────────
// Pipeline de admisión Kinetic — lógica de transición pura, testable
//
// El catálogo `intake_phase_catalog` (mig 0121) define las 17 sub-fases.
// Cada child y waitlist_entry tiene un `current_phase_code` que apunta a
// una fila del catálogo. Las transiciones aplican reglas (validación) y
// disparan side effects (crear child, cancelar citas, notificar).
// ──────────────────────────────────────────────────────────────────────────

import type {
  Appointment,
  ChildDischargeRecord,
  ChildPhaseHistoryEntry,
  IntakePhaseCatalogEntry,
  PhaseGroupNumber,
  UserRole,
} from '@/types/db'

export type PhaseSideEffect =
  | { type: 'create_child' }
  | { type: 'cancel_future_appointments'; requires_confirmation: true }
  | { type: 'notify_team'; roles: UserRole[] }
  | { type: 'create_discharge_record' }

export interface PhaseTransitionResult {
  allowed: boolean
  /** Si !allowed, explica por qué. */
  reason?: string
  /** Si la transición salta más de 1 paso adelante. UX puede advertir. */
  warning?: string
  /** Acciones que el caller debe ejecutar al confirmar. */
  side_effects: PhaseSideEffect[]
}

const STAFF_ROLES_THAT_CAN_REVERT: UserRole[] = ['admin', 'directora']
// Un retiro (5.2) es decisión de la familia, y la familia puede volver: lo
// reabren también las coordinadoras. El alta terapéutica (5.1) es un cierre
// clínico y sigue siendo solo de dirección.
const STAFF_ROLES_THAT_CAN_REOPEN_WITHDRAWAL: UserRole[] = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
]
const STAFF_ROLES_THAT_CAN_ADVANCE: UserRole[] = [
  'admin',
  'directora',
  'supervisor',
  'coordinadora_familias',
  'coordinadora_terapias',
  'terapista',
  'recepcion',
]

const NOTIFY_ROLES_ON_CLOSURE: UserRole[] = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
]

function getCatalogEntry(
  code: string,
  catalog: IntakePhaseCatalogEntry[],
): IntakePhaseCatalogEntry | null {
  return catalog.find((c) => c.code === code) ?? null
}

/**
 * Valida si la transición fromCode → toCode es permitida y devuelve los
 * side effects que deben ejecutarse.
 *
 * Reglas:
 *  - Toda transición requiere rol staff permitido.
 *  - Retroceder (toCode.sort_order < fromCode.sort_order) solo admin/directora.
 *  - Moverse entre las fases de tratamiento (3.3 Activo ⇄ 4.1 Pausa ⇄ 4.2
 *    Seguimiento) NO es retroceder: quien puede pausar puede reanudar.
 *  - Saltar 2+ pasos hacia adelante: permitido pero genera `warning`.
 *  - Reabrir un alta terapéutica (5.1) solo admin/directora. Un retiro (5.2)
 *    también lo reabren las coordinadoras, hacia cualquier fase.
 */
export function validateTransition(
  fromCode: string | null,
  toCode: string,
  catalog: IntakePhaseCatalogEntry[],
  actorRole: UserRole,
): PhaseTransitionResult {
  const to = getCatalogEntry(toCode, catalog)
  if (!to) {
    return {
      allowed: false,
      reason: `Fase destino desconocida: ${toCode}`,
      side_effects: [],
    }
  }
  if (!to.active) {
    return {
      allowed: false,
      reason: `La fase ${to.label} está inactiva.`,
      side_effects: [],
    }
  }

  const from = fromCode ? getCatalogEntry(fromCode, catalog) : null

  if (!STAFF_ROLES_THAT_CAN_ADVANCE.includes(actorRole)) {
    return {
      allowed: false,
      reason: 'Tu rol no permite cambiar fases.',
      side_effects: [],
    }
  }

  // Reverso o salir de fase terminal: solo admin/directora.
  // Entre fases de tratamiento el `sort_order` no dice nada: el grupo 4 no es una
  // etapa posterior a "Activo" sino un estado del que se entra y se sale. Tratar
  // 4.1 → 3.3 como retroceso dejaba a quien pausó a un niño sin poder reanudarlo.
  const isWithinTreatment =
    from != null && isChildInActiveTreatment(from.code) && isChildInActiveTreatment(to.code)
  const isBackwards = from ? to.sort_order < from.sort_order && !isWithinTreatment : false
  const isFromTerminal = from?.is_terminal ?? false
  const isFromWithdrawal = from?.code === '5_2_retirado'
  const canRevert = isFromWithdrawal
    ? STAFF_ROLES_THAT_CAN_REOPEN_WITHDRAWAL.includes(actorRole)
    : STAFF_ROLES_THAT_CAN_REVERT.includes(actorRole)
  if ((isBackwards || isFromTerminal) && !canRevert) {
    return {
      allowed: false,
      reason: isFromWithdrawal
        ? 'Solo admin, directora o las coordinadoras pueden reabrir un retiro.'
        : from?.code === '5_1_alta_terapeutica'
        ? 'Solo admin/directora puede reabrir un alta terapéutica.'
        : isFromTerminal
        ? 'Solo admin/directora puede reabrir desde una fase terminal.'
        : 'Solo admin/directora puede retroceder fases.',
      side_effects: [],
    }
  }

  // Salto hacia adelante: warning si salta más de un paso dentro del mismo grupo
  // o cruza un grupo entero sin pasar por la fase boundary (3.2).
  let warning: string | undefined
  if (from && !isBackwards) {
    const groupJump = to.group_number - from.group_number
    const inGroupJump = to.sort_order - from.sort_order
    if (groupJump > 1 || (groupJump === 0 && inGroupJump > 1)) {
      warning = `Estás saltando varias fases (${from.label} → ${to.label}). Quedará registrado en el historial.`
    }
  }

  return {
    allowed: true,
    warning,
    side_effects: getSideEffectsForTransition(to, from),
  }
}

/**
 * Devuelve los efectos colaterales de aterrizar en `to`. No depende de
 * `from` salvo para evitar duplicar `create_child` cuando ya hay child.
 */
export function getSideEffectsForTransition(
  to: IntakePhaseCatalogEntry,
  from: IntakePhaseCatalogEntry | null,
): PhaseSideEffect[] {
  const effects: PhaseSideEffect[] = []

  if (to.creates_child && (!from || !from.creates_child)) {
    effects.push({ type: 'create_child' })
  }

  if (to.cancels_future_appointments) {
    effects.push({ type: 'cancel_future_appointments', requires_confirmation: true })
  }

  if (to.is_terminal) {
    effects.push({ type: 'create_discharge_record' })
    effects.push({ type: 'notify_team', roles: NOTIFY_ROLES_ON_CLOSURE })
  }

  return effects
}

export interface PhaseGroup {
  group_number: PhaseGroupNumber
  group_name: string
  phases: IntakePhaseCatalogEntry[]
}

/** Agrupa el catálogo por `group_number` ordenado por `sub_order`. */
export function groupPhaseCatalog(
  catalog: IntakePhaseCatalogEntry[],
): PhaseGroup[] {
  const buckets = new Map<PhaseGroupNumber, PhaseGroup>()
  for (const entry of catalog) {
    if (!entry.active) continue
    const bucket =
      buckets.get(entry.group_number) ?? {
        group_number: entry.group_number,
        group_name: entry.group_name,
        phases: [],
      }
    bucket.phases.push(entry)
    buckets.set(entry.group_number, bucket)
  }
  const result = Array.from(buckets.values()).sort(
    (a, b) => a.group_number - b.group_number,
  )
  for (const g of result) {
    g.phases.sort((a, b) => a.sub_order - b.sub_order)
  }
  return result
}

/**
 * Devuelve la siguiente fase no-opcional luego de `fromCode`, o null si
 * `fromCode` ya es terminal. Las fases opcionales se incluyen como
 * candidatas: el caller puede ofrecerlas en un dropdown.
 */
export function getNextPhase(
  fromCode: string,
  catalog: IntakePhaseCatalogEntry[],
): IntakePhaseCatalogEntry | null {
  const from = getCatalogEntry(fromCode, catalog)
  if (!from || from.is_terminal) return null
  const candidates = catalog
    .filter((c) => c.active && c.sort_order > from.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)
  return candidates[0] ?? null
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers derivados (back-compat para componentes que antes leían
// intake_phase / treatment_status legacy — mig 0124)
// ──────────────────────────────────────────────────────────────────────────

/**
 * `true` si el niño está en tratamiento activo (recibiendo terapias):
 * grupo 3.3 (Activo en Terapias) o grupo 4.x (Seguimiento). Excluye los
 * niños aún en intake (1.x, 2.x, 3.1, 3.2) y los cierres (5.x).
 */
export function isChildInActiveTreatment(
  currentPhaseCode: string | null | undefined,
): boolean {
  if (!currentPhaseCode) return false
  return (
    currentPhaseCode === '3_3_activo_en_terapias' ||
    currentPhaseCode.startsWith('4_')
  )
}

/** `true` si el niño está pausado (4.1 Pausa Temporal). */
export function isChildPaused(currentPhaseCode: string | null | undefined): boolean {
  return currentPhaseCode === '4_1_pausa_temporal'
}

/**
 * `true` si el cambio REANUDA las terapias: vuelve a 3.3 Activo desde una pausa
 * o un seguimiento pendiente (4.x). El primer ingreso a activo y reabrir un
 * cierre no cuentan.
 */
export function isResumingTreatment(
  fromCode: string | null | undefined,
  toCode: string,
): boolean {
  return toCode === '3_3_activo_en_terapias' && !!fromCode?.startsWith('4_')
}

/** `true` si el niño está en una fase terminal (5.1 Alta o 5.2 Retirado). */
export function isChildClosed(currentPhaseCode: string | null | undefined): boolean {
  return (
    currentPhaseCode === '5_1_alta_terapeutica' ||
    currentPhaseCode === '5_2_retirado'
  )
}

/**
 * Última vez que el niño salió de una fase terminal (se reabrió un alta o un
 * retiro), o null si nunca pasó. Pasar de un cierre a otro no cuenta.
 */
export function lastReopenedAt(
  history: Array<Pick<ChildPhaseHistoryEntry, 'from_phase_code' | 'to_phase_code' | 'changed_at'>>,
): string | null {
  let latest: string | null = null
  for (const h of history) {
    if (!isChildClosed(h.from_phase_code) || isChildClosed(h.to_phase_code)) continue
    if (latest == null || new Date(h.changed_at).getTime() > new Date(latest).getTime()) {
      latest = h.changed_at
    }
  }
  return latest
}

/**
 * `true` si una baja sin enviar quedó cerrada porque el niño se reabrió
 * DESPUÉS de crearla (el retirado que vuelve). Sin esto, la baja firmada del
 * retiro anterior seguía "abierta": la ficha avisaba que estaba sin terminar, el
 * formulario la recargaba en vez de crear una nueva, y enviarla a la familia
 * volvía a retirar al niño. Se deriva del historial de fases, sin estado propio,
 * para que también cubra los niños que ya se reabrieron antes de esta regla.
 */
export function isDischargeSupersededByReopen(
  record: Pick<ChildDischargeRecord, 'status' | 'created_at'>,
  reopenedAt: string | null,
): boolean {
  if (record.status === 'sent_to_family' || reopenedAt == null) return false
  return new Date(record.created_at).getTime() < new Date(reopenedAt).getTime()
}

/** `true` si el niño está aún en pipeline de admisión (grupos 1 y 2). */
export function isChildInIntake(currentPhaseCode: string | null | undefined): boolean {
  if (!currentPhaseCode) return false
  return currentPhaseCode.startsWith('1_') || currentPhaseCode.startsWith('2_')
}

/**
 * Devuelve la fase del catálogo dado un code; null si no se encuentra.
 * Helper de conveniencia para componentes que tienen un array de phases.
 */
export function phaseByCode(
  code: string | null | undefined,
  catalog: IntakePhaseCatalogEntry[],
): IntakePhaseCatalogEntry | null {
  if (!code) return null
  return catalog.find((p) => p.code === code) ?? null
}

export interface DischargeStats {
  total_sessions_attended: number
  attendance_rate_pct: number
  total_replacements: number
}

const COMPLETED_STATUSES = new Set(['completed'])
const COUNTED_STATUSES = new Set(['completed', 'no_show', 'late_cancel'])
const REPLACEMENT_STATUSES = new Set(['replacement'])

/**
 * Calcula el resumen estadístico que se snapshot-ea en
 * `child_discharge_records` al firmar el alta/retiro.
 *
 * - total_sessions_attended: appointments completed del niño.
 * - attendance_rate_pct: completed / (completed + no_show + late_cancel)
 *   * 100, redondeado a 2 decimales.
 * - total_replacements: appointments en estado replacement (asistidos
 *   como reposición).
 */
export function calculateDischargeStats(
  appointments: Appointment[],
  childId: string,
): DischargeStats {
  let completed = 0
  let counted = 0
  let replacements = 0
  for (const a of appointments) {
    if (a.child_id !== childId) continue
    if (COMPLETED_STATUSES.has(a.status)) completed += 1
    if (COUNTED_STATUSES.has(a.status)) counted += 1
    if (REPLACEMENT_STATUSES.has(a.status)) replacements += 1
  }
  const attendance_rate_pct = counted === 0 ? 0 : Math.round((completed / counted) * 10000) / 100
  return {
    total_sessions_attended: completed,
    attendance_rate_pct,
    total_replacements: replacements,
  }
}
