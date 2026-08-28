/**
 * Arma los datos del "Detalle de pago mensual" — el documento que se le manda al
 * padre ANTES de pagar (distinto de la factura). Muestra: calendario del mes,
 * desglose por terapia (días, cantidad, fechas), el plan contratado por día de la
 * semana, y la tabla de costos con el total. Función pura (testable, sin Supabase).
 *
 * DOS FUENTES, A PROPÓSITO — no mezclarlas:
 *   - Lo que se COBRA (tabla de costos + total) sale del snapshot del ciclo
 *     (`therapies_json[].sessions_per_month × unit_cost_usd`), que es la misma
 *     fuente que usan la factura (`buildCycleLineItems`) y `payment_amount_usd`.
 *   - Lo que se AGENDÓ (calendario + días y fechas por terapia) sale de las citas
 *     reales del mes.
 * Las dos pueden diferir legítimamente: una reposición de un mes anterior, una
 * sesión extra agendada después de generar el ciclo, o una cita retirada de la
 * agenda. Antes la tabla de costos contaba citas en vivo y el total venía del
 * snapshot, así que las filas no sumaban el total y nada lo explicaba. Ahora la
 * tabla cobra lo facturado y las diferencias se declaran en `agendaNotes`.
 */

import { toZonedTime } from 'date-fns-tz'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  ServiceType,
  TreatmentPlanTherapyEntry,
  TreatmentPlanScheduleSlot,
} from '@/types/db'
import { isMonthlyFlatEntry, isMorningProgramService, therapyLineAmount } from './monthly-flat'
import { CHARGE_EXCLUDED_STATUSES } from './agenda-charge-sync'

const TZ = 'America/El_Salvador'
const WEEK_DOWS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
const WEEKEND_DOWS = ['sat', 'sun'] as const
// Orden completo lun..dom, para ordenar entradas que sí pueden caer en fin de
// semana (desglose por terapia) — WEEK_DOWS por sí solo daría indexOf=-1 para
// sábado/domingo y los ordenaría antes que lunes.
const FULL_WEEK_ORDER = [...WEEK_DOWS, ...WEEKEND_DOWS] as const
export const DOW_LABEL: Record<string, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}
const JS_DOW_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export interface CycleDetailAppt {
  starts_at: string
  service_type: string | null
  status: string
  /** Cita sacada de la agenda por una suspensión avisada (mig 0184): ni se
   *  muestra como fecha del mes ni se cobra. */
  suspension_id?: string | null
}

export interface TherapyDayBreakdown {
  dow: string
  dowLabel: string
  count: number
  dates: number[]
}

export interface TherapyBreakdown {
  service: string
  label: string
  days: TherapyDayBreakdown[]
  total: number
  /** Cuántas de esas sesiones son reposiciones (ya cobradas en su propio mes). */
  replacements: number
  /** Cuántas fueron inasistencias (el niño no llegó): la fecha está en la agenda
   *  pero la sesión no se dio. */
  absences: number
}

export interface CostRow {
  service: string
  label: string
  /** Sesiones COBRADAS este mes (snapshot del ciclo), no el conteo de la agenda. */
  count: number
  unitCost: number
  total: number
  isFlat: boolean
  /** Duración real de la sesión (del patrón de horario) — null en mensualidades planas. */
  durationMinutes: number | null
}

export interface WeeklyPlanCell {
  dow: string
  dowLabel: string
  therapies: string[]
}

export interface CycleDetailData {
  childName: string
  periodLabel: string
  year: number
  month: number // 1-12
  daysInMonth: number
  firstDowIndexMon: number // 0 = lunes
  dayHasAppt: boolean[] // longitud daysInMonth+1; índice = día del mes
  therapyBreakdowns: TherapyBreakdown[]
  weeklyPlan: WeeklyPlanCell[] // lunes..viernes siempre + sábado/domingo solo si el plan los usa
  costRows: CostRow[]
  subtotal: number
  discountLabel: string | null
  /** Monto del descuento en $ (misma regla que la factura), 0 si no hay. */
  discountAmount: number
  /** Recargo por mora YA generado en este ciclo. Desde la mig 0175 NO forma parte
   *  de este total: se cobra como línea en la mensualidad siguiente. */
  surcharge: number
  total: number
  /**
   * El monto registrado en el ciclo (`payment_amount_usd`) no coincide con lo
   * que suman las filas de este detalle. **Las filas siempre mandan**: son la
   * misma fuente que arma la factura (`buildCycleLineItems`), así que un total
   * distinto haría que este documento contradijera a la factura del mismo mes.
   *
   * - `paid`: el mes ya se pagó y el detalle se corrigió después (típicamente al
   *   emparejar el cobro con la agenda). No se re-cobra: la diferencia se
   *   acredita o se carga en la mensualidad siguiente.
   * - `pending`: el mes todavía no se cobra y el monto registrado quedó
   *   desactualizado — pasa cuando el ciclo se generó con el patrón completo del
   *   mes y después se agendaron menos sesiones. Hay que emparejarlo desde
   *   /operacion/sincronizar-cobros.
   */
  settlement: {
    kind: 'paid' | 'pending'
    /** `payment_amount_usd`: lo que el ciclo tiene registrado, pagado o no. */
    registeredAmount: number
    /** Positivo = falta cobrarle; negativo = a favor de la familia. */
    adjustment: number
  } | null
  /** Diferencias agenda ↔ cobro, redactadas para el padre. Vacío si todo calza. */
  agendaNotes: string[]
}

function serviceLabel(s: string): string {
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? s
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Día del mes (1..31) y clave de día de semana en TZ SV, para un ISO UTC. */
function svParts(iso: string): { day: number; dow: string } {
  const local = toZonedTime(new Date(iso), TZ)
  return { day: local.getDate(), dow: JS_DOW_TO_KEY[local.getDay()] }
}

export interface BuildCycleDetailInput {
  childName: string
  periodMonth: string // 'YYYY-MM-01'
  therapies: TreatmentPlanTherapyEntry[]
  schedule: TreatmentPlanScheduleSlot[]
  appointments: CycleDetailAppt[]
  paymentAmountUsd: number
  discountKind?: string | null
  discountValue?: number | null
  surchargeUsd?: number | null
  /** Estado de pago del ciclo. Un mes ya pagado no se re-cobra. */
  paymentStatus?: 'pending' | 'paid' | null
  /** Diferencia arrastrada a la mensualidad siguiente (mig 0177/0178). */
  billingAdjustmentUsd?: number | null
}

export function buildCycleDetail(input: BuildCycleDetailInput): CycleDetailData {
  const [year, month] = input.periodMonth.slice(0, 7).split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  // Día de semana del 1ro (lunes = 0). Se usa UTC para evitar corrimientos de TZ.
  const firstJsDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const firstDowIndexMon = (firstJsDow + 6) % 7

  // Solo citas que no se cancelaron/reagendaron cuentan para el detalle.
  const liveAppts = input.appointments.filter(
    (a) => !['cancelled', 'rescheduled'].includes(a.status),
  )

  const dayHasAppt: boolean[] = new Array(daysInMonth + 1).fill(false)
  // service -> dow -> Set(dates)
  const byServiceDow = new Map<string, Map<string, Set<number>>>()
  // Reposiciones por servicio: son citas que reponen una falta YA cobrada en su
  // mes (status 'replacement', mig 0155) — van al calendario y al desglose de
  // fechas, pero NUNCA se cobran de nuevo acá.
  const replacementByService = new Map<string, number>()
  // Inasistencias: la fecha existe en la agenda y el niño no llegó. Se muestran
  // (es información real para la familia) pero hay que decir qué son, o el
  // calendario marca un día que nadie entiende.
  const absenceByService = new Map<string, number>()
  for (const a of liveAppts) {
    const svc = a.service_type ?? 'otra'
    const { day, dow } = svParts(a.starts_at)
    if (day >= 1 && day <= daysInMonth) dayHasAppt[day] = true
    if (!byServiceDow.has(svc)) byServiceDow.set(svc, new Map())
    const dowMap = byServiceDow.get(svc)!
    if (!dowMap.has(dow)) dowMap.set(dow, new Set())
    dowMap.get(dow)!.add(day)
    if (a.status === 'replacement') {
      replacementByService.set(svc, (replacementByService.get(svc) ?? 0) + 1)
    } else if (a.status === 'no_show' || a.status === 'late_cancel') {
      absenceByService.set(svc, (absenceByService.get(svc) ?? 0) + 1)
    }
  }

  // Citas cobrables del mes, con la MISMA regla que usa el sync agenda→cobro
  // (`billableSessionCounts`): así el aviso de diferencia no salta en falso.
  // Ojo: incluye las `cancelled`, que sí se cobran este mes y se acreditan el
  // siguiente por rollover — por eso no se calcula sobre `liveAppts`.
  const billableApptByService = new Map<string, number>()
  for (const a of input.appointments) {
    if (CHARGE_EXCLUDED_STATUSES.includes(a.status)) continue
    if (a.suspension_id) continue // suspensión avisada: no se cobra
    const svc = a.service_type ?? 'otra'
    billableApptByService.set(svc, (billableApptByService.get(svc) ?? 0) + 1)
  }

  // Desglose por terapia (ordenado por etiqueta).
  const therapyBreakdowns: TherapyBreakdown[] = Array.from(byServiceDow.entries())
    .map(([service, dowMap]) => {
      const days: TherapyDayBreakdown[] = Array.from(dowMap.entries())
        .map(([dow, dateSet]) => ({
          dow,
          dowLabel: DOW_LABEL[dow] ?? dow,
          count: dateSet.size,
          dates: Array.from(dateSet).sort((x, y) => x - y),
        }))
        .sort((a, b) => FULL_WEEK_ORDER.indexOf(a.dow as (typeof FULL_WEEK_ORDER)[number]) - FULL_WEEK_ORDER.indexOf(b.dow as (typeof FULL_WEEK_ORDER)[number]))
      const total = days.reduce((s, d) => s + d.count, 0)
      return {
        service,
        label: serviceLabel(service),
        days,
        total,
        replacements: replacementByService.get(service) ?? 0,
        absences: absenceByService.get(service) ?? 0,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  // Plan contratado por día de la semana. Lunes..viernes siempre se muestran
  // (aunque el día quede sin terapia, como antes); sábado/domingo se agregan
  // solo si el patrón realmente tiene una terapia ese día — evita 2 columnas
  // vacías en el caso común (todo entre semana) sin perder las que sí caen
  // en fin de semana.
  const usedWeekendDows = WEEKEND_DOWS.filter((dow) =>
    input.schedule.some((s) => s.day_of_week === dow),
  )
  const weeklyPlan: WeeklyPlanCell[] = [...WEEK_DOWS, ...usedWeekendDows].map((dow) => {
    const therapies = input.schedule
      .filter((s) => s.day_of_week === dow)
      .map((s) => serviceLabel(s.service))
    return { dow, dowLabel: DOW_LABEL[dow], therapies }
  })

  // Tabla de costos: una fila por terapia activa del snapshot del ciclo.
  // El "# EN EL MES" es lo COBRADO (sessions_per_month del snapshot), no el
  // conteo de la agenda — así las filas suman el total y coinciden con la
  // factura. Fallback al conteo de citas cobrables solo si el snapshot es viejo
  // y no trae la cantidad.
  const costRows: CostRow[] = input.therapies
    .filter((t) => t.active)
    .map((t) => {
      const flat = isMonthlyFlatEntry(t)
      const billed = Number(t.sessions_per_month)
      // Una mensualidad fija se cobra 1 × precio venga el mes que venga: su
      // `sessions_per_month` no participa del cobro y puede traer cualquier cosa
      // (0 incluido), así que mostrarlo daría "0 × $170 = $170".
      const count = flat
        ? 1
        : Number.isFinite(billed)
          ? billed
          : billableApptByService.get(t.service) ?? 0
      const unitCost = Number(t.unit_cost_usd ?? 0)
      const total = therapyLineAmount({
        service: t.service,
        billing_mode: t.billing_mode,
        sessions_per_month: count,
        unit_cost_usd: unitCost,
      })
      // Duración real configurada para esta terapia (del patrón de horario, no
      // asumida) — para aclarar en el PDF a cuánto corresponde el precio
      // unitario (ej. "Ils Escucha (60 min)" vs. el resto, típicamente 30 min).
      const durationMinutes = flat
        ? null
        : input.schedule.find((s) => s.service === t.service)?.duration_minutes ?? null
      return {
        service: t.service,
        label: serviceLabel(t.service),
        count,
        unitCost,
        total,
        isFlat: flat,
        durationMinutes,
      }
    })

  const subtotal = round2(costRows.reduce((s, r) => s + r.total, 0))

  let discountLabel: string | null = null
  let discountAmount = 0
  const dk = input.discountKind ?? 'none'
  const dv = Number(input.discountValue ?? 0)
  // Misma regla que la factura (createInvoiceForCycle): el % se aplica sobre el
  // subtotal y el fijo se topa al subtotal.
  if (dk === 'percent' && dv > 0) {
    discountLabel = `Descuento ${dv}%`
    discountAmount = round2((subtotal * dv) / 100)
  } else if (dk === 'fixed' && dv > 0) {
    discountLabel = 'Descuento'
    discountAmount = Math.min(round2(dv), subtotal)
  }

  // ── Diferencias agenda ↔ cobro ────────────────────────────────────────────
  // Las mensualidades fijas (programas matutinos) se cobran por mes, no por
  // sesión: su conteo de citas nunca debe generar aviso.
  const flatServices = new Set<string>([
    ...costRows.filter((r) => r.isFlat).map((r) => r.service),
    ...input.therapies.filter((t) => isMonthlyFlatEntry(t)).map((t) => t.service),
  ])
  const isFlatService = (svc: string) => flatServices.has(svc) || isMorningProgramService(svc)

  const billedByService = new Map<string, number>()
  for (const r of costRows) if (!r.isFlat) billedByService.set(r.service, r.count)

  let replacementsTotal = 0
  for (const [svc, n] of replacementByService) if (!isFlatService(svc)) replacementsTotal += n

  let absencesTotal = 0
  for (const [svc, n] of absenceByService) if (!isFlatService(svc)) absencesTotal += n

  // Servicios a comparar: los que tienen fila de cobro + los que solo aparecen
  // en la agenda (ej. una terapia agregada al plan después de generar el ciclo).
  let extraNotBilled = 0
  let billedNotScheduled = 0
  for (const svc of new Set([...billedByService.keys(), ...billableApptByService.keys()])) {
    if (isFlatService(svc)) continue
    const billed = billedByService.get(svc) ?? 0
    const scheduled = billableApptByService.get(svc) ?? 0
    if (scheduled > billed) extraNotBilled += scheduled - billed
    else if (billed > scheduled) billedNotScheduled += billed - scheduled
  }

  const agendaNotes: string[] = []
  if (replacementsTotal > 0) {
    agendaNotes.push(
      replacementsTotal === 1
        ? 'El calendario incluye 1 sesión de reposición sin costo: repone una falta ya cobrada en su mensualidad.'
        : `El calendario incluye ${replacementsTotal} sesiones de reposición sin costo: reponen faltas ya cobradas en su mensualidad.`,
    )
  }
  // Una fecha marcada en el calendario que no se cobra suele ser una inasistencia
  // que no se le cargó a la familia. Decir solo "no está incluida en este cobro"
  // hace pensar que falta cobrarla; hay que nombrarla por lo que es.
  const absencesNotBilled = Math.min(absencesTotal, extraNotBilled)
  const otherNotBilled = extraNotBilled - absencesNotBilled
  if (absencesNotBilled > 0) {
    agendaNotes.push(
      absencesNotBilled === 1
        ? 'El calendario marca 1 sesión a la que el niño/a no asistió. No se está cobrando.'
        : `El calendario marca ${absencesNotBilled} sesiones a las que el niño/a no asistió. No se están cobrando.`,
    )
  }
  if (otherNotBilled > 0) {
    agendaNotes.push(
      otherNotBilled === 1
        ? '1 sesión agendada este mes no está incluida en este cobro.'
        : `${otherNotBilled} sesiones agendadas este mes no están incluidas en este cobro.`,
    )
  }
  if (billedNotScheduled > 0) {
    agendaNotes.push(
      billedNotScheduled === 1
        ? '1 sesión cobrada aún no aparece en el calendario (pendiente de reagendar).'
        : `${billedNotScheduled} sesiones cobradas aún no aparecen en el calendario (pendientes de reagendar).`,
    )
  }

  const periodLabel = new Date(`${input.periodMonth.slice(0, 10)}T12:00:00`).toLocaleDateString(
    'es-SV',
    { month: 'long', year: 'numeric' },
  )

  // Monto del ciclo (`payment_amount_usd`): lo que el sistema cobra por este mes.
  const cycleAmount = round2(
    Number.isFinite(Number(input.paymentAmountUsd))
      ? Number(input.paymentAmountUsd)
      : subtotal - discountAmount,
  )
  // Costo real del mes según el detalle de arriba.
  const detailAmount = round2(subtotal - discountAmount)

  // El documento NUNCA muestra un total que sus propias filas contradicen: si el
  // monto registrado en el ciclo no cuadra, manda el detalle y la diferencia se
  // declara aparte. Vale igual para un mes pagado (la diferencia viaja a la
  // mensualidad siguiente) que para uno pendiente (el monto registrado quedó
  // viejo — hay que emparejarlo en /operacion/sincronizar-cobros).
  //
  // Antes esto solo aplicaba al mes pagado: uno pendiente imprimía
  // `payment_amount_usd` contra unas filas que sumaban otra cosa, sin decir
  // nada. Caso real: filas por $236 (3 sesiones) bajo un total de $258 (4), o
  // sea $22 de más, mientras la factura del mismo mes decía $236.
  const mismatch = Math.abs(detailAmount - cycleAmount) >= 0.01
  const settlement =
    mismatch && (input.paymentStatus === 'paid' || input.paymentStatus === 'pending')
      ? {
          kind: input.paymentStatus,
          registeredAmount: cycleAmount,
          adjustment: round2(
            // El ajuste registrado solo aplica al mes ya pagado; en uno
            // pendiente la diferencia es simplemente detalle − registrado.
            input.paymentStatus === 'paid' && Number.isFinite(Number(input.billingAdjustmentUsd))
              ? Number(input.billingAdjustmentUsd)
              : detailAmount - cycleAmount,
          ),
        }
      : null

  return {
    childName: input.childName,
    periodLabel,
    year,
    month,
    daysInMonth,
    firstDowIndexMon,
    dayHasAppt,
    therapyBreakdowns,
    weeklyPlan,
    costRows,
    subtotal,
    discountLabel,
    discountAmount,
    surcharge: round2(Number(input.surchargeUsd ?? 0)),
    // Manda el detalle siempre que haya desfase; si todo cuadra, da igual cuál
    // se use. (`mark_monthly_cycle_paid` no recibe ningún monto, así que imprimir
    // el del detalle no afecta el registro del pago.)
    total: settlement ? detailAmount : cycleAmount,
    settlement,
    agendaNotes,
  }
}
