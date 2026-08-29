/**
 * Todo lo que se le va a cobrar a una familia por un mes, para revisarlo ANTES
 * de generar el documento y la factura.
 *
 * El detalle de pago y la factura nunca cubrieron lo mismo: el detalle muestra
 * las terapias del mes, y la factura además cobra lo que se arrastra de meses
 * anteriores (recargo por mora, ajustes de un mes ya pagado) y descuenta el
 * rollover. Revisar solo el detalle dejaba fuera justo lo que hace que los dos
 * números no coincidan.
 *
 * Es SOLO LECTURA. Crear la factura además marca los meses de origen como ya
 * cobrados; previsualizar no puede tocar nada, por eso la regla vive aparte en
 * `computeCarryIns`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { Database, DiscountKind, MonthlySessionCycle, ServiceType } from '@/types/db'
import { buildCycleDetail, type CycleDetailData } from './cycle-detail'
import { loadCycleDetailInput } from './cycle-detail-input'
import { chargeTotalWithCarryIns, computeCarryIns, type CarryInLine } from './carry-ins'
import { isMonthlyFlatEntry } from './monthly-flat'
import {
  extraChargesTotal,
  normalizeExtraCharges,
  type ExtraChargeLine,
} from './extra-charges'
import { hasSessionsOverride, hasUnitCostOverride } from './manual-overrides'

export interface CycleChargePreview {
  childName: string
  /** 'YYYY-MM-01' */
  periodMonth: string
  /** El mismo detalle que imprime el PDF. */
  detail: CycleDetailData
  /** Lo que se suma o resta por meses anteriores. Vacío si no hay nada. */
  carryIns: CarryInLine[]
  /** Líneas de cobro que no son terapias (materiales, evaluación suelta…). */
  extraCharges: ExtraChargeLine[]
  /** Crédito por sesiones no dadas (solo si el ciclo usa `rollover_mode='discount'`). */
  rolloverDiscountUsd: number
  /** Lo que la familia va a pagar: el mes ± los arrastres. */
  totalToCharge: number
  /** Para avisar que un ciclo anulado no se le va a cobrar a nadie. */
  cycleStatus: string
  paymentStatus: 'pending' | 'paid'
  /**
   * Filas tal como hay que guardarlas. `detail.costRows` sirve para MOSTRAR: en
   * una mensualidad fija muestra 1 porque es lo que se cobra, y guardar ese 1
   * pisaría el valor real del snapshot.
   */
  editableRows: EditableChargeRow[]
  discountKind: DiscountKind
  discountValue: number
  discountReason: string | null
  /**
   * `editMonthlyCycle` actualiza con un guard de `payment_status='pending'`, así
   * que un ciclo pagado o anulado no se puede editar desde acá: se corrige por
   * /operacion/sincronizar-cobros, que manda la diferencia al mes siguiente.
   */
  canEdit: boolean
}

export interface EditableChargeRow {
  service: string
  label: string
  /** El valor real del snapshot, no el 1 de presentación de una mensualidad. */
  sessionsPerMonth: number
  unitCostUsd: number
  isFlat: boolean
  billingMode?: string
  /** La cantidad la fijó una persona: el emparejado automático no la toca. */
  overridden: boolean
  /** El precio lo fijó una persona: el catálogo no lo pisa. */
  priceOverridden: boolean
}

/** `null` si el ciclo no existe. */
export async function buildCycleChargePreview(
  supabase: SupabaseClient<Database>,
  cycleId: string,
): Promise<CycleChargePreview | null> {
  const input = await loadCycleDetailInput(supabase, cycleId)
  if (!input) return null
  const cycle = input.cycle as MonthlySessionCycle

  const detail = buildCycleDetail({
    childName: input.childName,
    periodMonth: input.periodMonth,
    therapies: input.therapies,
    schedule: input.schedule,
    appointments: input.appointments,
    paymentAmountUsd: Number(cycle.payment_amount_usd ?? 0),
    discountKind: cycle.discount_kind,
    discountValue: cycle.discount_value,
    surchargeUsd: cycle.surcharge_amount_usd,
    paymentStatus: cycle.payment_status,
    billingAdjustmentUsd: cycle.billing_adjustment_usd,
    extraCharges: normalizeExtraCharges(
      (cycle as { extra_charges_json?: unknown }).extra_charges_json,
    ),
  })

  // La exención de mora es de la familia, no del niño.
  const { data: childRow } = await supabase
    .from('children')
    .select('family_id')
    .eq('id', cycle.child_id)
    .maybeSingle()
  const familyId = (childRow as { family_id?: string } | null)?.family_id ?? null
  let lateFeeExempt = false
  if (familyId) {
    const { data: familyRow } = await supabase
      .from('families')
      .select('late_fee_exempt')
      .eq('id', familyId)
      .maybeSingle()
    lateFeeExempt = !!(familyRow as { late_fee_exempt?: boolean } | null)?.late_fee_exempt
  }

  // Mismas consultas que hace createInvoiceForCycle para decidir los arrastres.
  const [{ data: pendingSurchargeRaw }, { data: pendingAdjRaw }] = await Promise.all([
    supabase
      .from('monthly_session_cycles')
      .select('id, period_month, surcharge_amount_usd')
      .eq('child_id', cycle.child_id)
      .neq('status', 'cancelled')
      .eq('payment_status', 'paid')
      .gt('surcharge_amount_usd', 0)
      .is('surcharge_carried_at', null)
      .lt('period_month', cycle.period_month)
      .order('period_month'),
    supabase
      .from('monthly_session_cycles')
      .select('id, period_month, billing_adjustment_usd')
      .eq('child_id', cycle.child_id)
      .neq('status', 'cancelled')
      .eq('payment_status', 'paid')
      .neq('billing_adjustment_usd', 0)
      .is('billing_adjustment_carried_at', null)
      .lt('period_month', cycle.period_month)
      .order('period_month'),
  ])

  const carry = computeCarryIns({
    cycle: {
      period_month: String(cycle.period_month),
      surcharge_carried_in_usd: cycle.surcharge_carried_in_usd,
      billing_adjustment_carried_in_usd: cycle.billing_adjustment_carried_in_usd,
    },
    familyLateFeeExempt: lateFeeExempt,
    pendingSurchargeCycles: (pendingSurchargeRaw ?? []) as {
      id: string
      period_month: string
      surcharge_amount_usd: number
    }[],
    pendingAdjustmentCycles: (pendingAdjRaw ?? []) as {
      id: string
      period_month: string
      billing_adjustment_usd: number
    }[],
  })

  const rolloverDiscountUsd =
    cycle.rollover_mode === 'discount' ? Number(cycle.rollover_discount_usd ?? 0) : 0

  // Tolera que la 0185 no esté aplicada todavía: la columna llega `undefined` y
  // `normalizeExtraCharges` devuelve lista vacía en vez de romper.
  const extraCharges = normalizeExtraCharges(
    (cycle as { extra_charges_json?: unknown }).extra_charges_json,
  )

  return {
    childName: input.childName,
    periodMonth: input.periodMonth,
    detail,
    carryIns: carry.lines,
    extraCharges,
    rolloverDiscountUsd,
    totalToCharge: chargeTotalWithCarryIns({
      subtotal: detail.subtotal,
      discountAmount: detail.discountAmount,
      rolloverDiscountUsd,
      carryInTotal: carry.surchargeTotal + carry.adjustmentTotal,
      extraChargesTotal: extraChargesTotal(extraCharges),
    }),
    cycleStatus: String(cycle.status),
    paymentStatus: cycle.payment_status,
    editableRows: input.therapies
      .filter((t) => t.active !== false)
      .map((t) => ({
        service: t.service,
        label: SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service,
        sessionsPerMonth: Number(t.sessions_per_month ?? 0),
        unitCostUsd: Number(t.unit_cost_usd ?? 0),
        isFlat: isMonthlyFlatEntry(t),
        billingMode: t.billing_mode,
        overridden: hasSessionsOverride(t),
        priceOverridden: hasUnitCostOverride(t),
      })),
    discountKind: (cycle.discount_kind ?? 'none') as DiscountKind,
    discountValue: Number(cycle.discount_value ?? 0),
    discountReason: cycle.discount_reason ?? null,
    canEdit: cycle.status === 'generated' && cycle.payment_status === 'pending',
  }
}
