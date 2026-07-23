/**
 * Arma los datos del "Detalle de pago mensual" — el documento que se le manda al
 * padre ANTES de pagar (distinto de la factura). Muestra: calendario del mes,
 * desglose por terapia (días, cantidad, fechas), el plan contratado por día de la
 * semana, y la tabla de costos con el total. Función pura (testable, sin Supabase).
 */

import { toZonedTime } from 'date-fns-tz'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  ServiceType,
  TreatmentPlanTherapyEntry,
  TreatmentPlanScheduleSlot,
} from '@/types/db'
import { isMonthlyFlatEntry, therapyLineAmount } from './monthly-flat'

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
}

export interface CostRow {
  service: string
  label: string
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
  surcharge: number
  total: number
}

function serviceLabel(s: string): string {
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? s
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
  for (const a of liveAppts) {
    const svc = a.service_type ?? 'otra'
    const { day, dow } = svParts(a.starts_at)
    if (day >= 1 && day <= daysInMonth) dayHasAppt[day] = true
    if (!byServiceDow.has(svc)) byServiceDow.set(svc, new Map())
    const dowMap = byServiceDow.get(svc)!
    if (!dowMap.has(dow)) dowMap.set(dow, new Set())
    dowMap.get(dow)!.add(day)
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
      return { service, label: serviceLabel(service), days, total }
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

  // Conteo real de citas por servicio en el mes (para "# de terapias en el mes").
  const countByService = new Map<string, number>()
  for (const b of therapyBreakdowns) countByService.set(b.service, b.total)

  // Tabla de costos: una fila por terapia activa del plan.
  const costRows: CostRow[] = input.therapies
    .filter((t) => t.active)
    .map((t) => {
      const count = countByService.get(t.service) ?? t.sessions_per_month ?? 0
      const flat = isMonthlyFlatEntry(t)
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

  const subtotal = costRows.reduce((s, r) => s + r.total, 0)

  let discountLabel: string | null = null
  const dk = input.discountKind ?? 'none'
  const dv = Number(input.discountValue ?? 0)
  if (dk === 'percent' && dv > 0) discountLabel = `Descuento ${dv}%`
  else if (dk === 'fixed' && dv > 0) discountLabel = `Descuento $${dv.toFixed(2)}`

  const periodLabel = new Date(`${input.periodMonth.slice(0, 10)}T12:00:00`).toLocaleDateString(
    'es-SV',
    { month: 'long', year: 'numeric' },
  )

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
    surcharge: Number(input.surchargeUsd ?? 0),
    total: Number(input.paymentAmountUsd ?? subtotal),
  }
}
