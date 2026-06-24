/**
 * Desglose de terapias COMPLETADAS por terapista, con granularidad día/semana/mes.
 *
 * Alimenta la vista de "horas completadas" dentro de Capacidad del equipo, donde
 * recepción/coordinadoras/admin revisan lo que cada terapista completó y marcan
 * cuáles fueron extraordinarias (`is_extra`) — esas son las que entran a la
 * planilla de SERVICIOS PROFESIONALES.
 *
 * Reúsa la matemática pura de pago (`sumProfessionalServicesPay` /
 * `professionalServicesBaseFor`) y el mapa de tarifas de catálogo (`cost_usd`),
 * igual que `getTherapistTherapyEarnings`.
 */

import { fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ExtraReason } from '@/types/db'
import {
  sumProfessionalServicesPay,
  professionalServicesBaseFor,
  type CompletedTherapyForPay,
} from '@/lib/domain/payroll/professional-services'

const TZ = 'America/El_Salvador'

const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export type CompletedGranularity = 'dia' | 'semana' | 'mes'

export interface CompletedTherapyRow {
  appointmentId: string
  childName: string
  serviceType: string | null
  startsAt: string
  durationMin: number
  isExtra: boolean
  extraReason: ExtraReason | null
  costUsd: number
}

export interface TherapistCompletedGroup {
  therapistId: string
  fullName: string
  /** En planilla de servicios profesionales (cobra por terapia). */
  inProfessionalServices: boolean
  /** Si también está en planilla normal: solo las extra cuentan a SP. */
  extraOnly: boolean
  rows: CompletedTherapyRow[]
  completedCount: number
  totalHours: number
  /** Terapias que cuentan a servicios profesionales en esta ventana. */
  payableCount: number
  /** Monto que iría a la planilla de servicios profesionales (USD). */
  amountUsd: number
}

export interface CompletedTherapiesReport {
  granularity: CompletedGranularity
  rangeLabel: string
  windowStartISO: string
  windowEndISO: string
  groups: TherapistCompletedGroup[]
  totalUsd: number
}

/** Lunes (en términos de calendario) que contiene la fecha Y-M-D dada. */
function mondayOf(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const utc = new Date(Date.UTC(y, m - 1, d))
  const dow = utc.getUTCDay() // 0=dom..6=sáb
  const diff = dow === 0 ? -6 : 1 - dow
  utc.setUTCDate(utc.getUTCDate() + diff)
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() }
}

function fmtDayLabel(y: number, m: number, d: number): string {
  return `${d} de ${MONTH_LABELS[m - 1]} ${y}`
}

/** Resuelve la ventana [startISO, endISO) en zona SV + una etiqueta legible. */
export function resolveWindow(
  granularity: CompletedGranularity,
  anchorDate: string,
): { startISO: string; endISO: string; label: string } {
  const [y, m, d] = anchorDate.split('-').map(Number)

  if (granularity === 'dia') {
    const start = fromZonedTime(new Date(y, m - 1, d, 0, 0, 0), TZ)
    const end = fromZonedTime(new Date(y, m - 1, d + 1, 0, 0, 0), TZ)
    return { startISO: start.toISOString(), endISO: end.toISOString(), label: fmtDayLabel(y, m, d) }
  }

  if (granularity === 'mes') {
    const start = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ)
    const end = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ)
    return {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label: `${MONTH_LABELS[m - 1]} ${y}`,
    }
  }

  // semana (lunes 00:00 → lunes siguiente 00:00, SV)
  const mon = mondayOf(y, m, d)
  const start = fromZonedTime(new Date(mon.y, mon.m - 1, mon.d, 0, 0, 0), TZ)
  const end = fromZonedTime(new Date(mon.y, mon.m - 1, mon.d + 7, 0, 0, 0), TZ)
  const sunUtc = new Date(Date.UTC(mon.y, mon.m - 1, mon.d + 6))
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    label: `${fmtDayLabel(mon.y, mon.m, mon.d)} – ${fmtDayLabel(
      sunUtc.getUTCFullYear(),
      sunUtc.getUTCMonth() + 1,
      sunUtc.getUTCDate(),
    )}`,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface ApptJoinRow {
  id: string
  therapist_id: string | null
  service_type: string | null
  service_code: string | null
  external_child_name: string | null
  event_type: string
  starts_at: string
  ends_at: string
  is_extra: boolean
  extra_reason: ExtraReason | null
  children: { full_name: string } | { full_name: string }[] | null
}

function childNameOf(row: ApptJoinRow): string {
  const c = row.children
  if (c) {
    if (Array.isArray(c)) return c[0]?.full_name ?? 'Niño/a'
    return c.full_name ?? 'Niño/a'
  }
  // Evaluaciones a personas nuevas: nombre libre.
  return row.external_child_name ?? 'Evaluación'
}

/**
 * Trae las terapias completadas en la ventana y las agrupa por terapista, con
 * el monto que iría a servicios profesionales según las reglas de planilla.
 */
export async function getCompletedTherapiesDetail(
  supabase: SupabaseClient<Database>,
  { granularity, anchorDate }: { granularity: CompletedGranularity; anchorDate: string },
): Promise<CompletedTherapiesReport> {
  const { startISO, endISO, label } = resolveWindow(granularity, anchorDate)

  // Terapistas (con flags de planilla).
  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, full_name, in_normal_payroll, in_professional_services_payroll')
    .in('role', ['terapista', 'maestra'])
  const users = (usersRaw ?? []) as {
    id: string
    full_name: string
    in_normal_payroll: boolean
    in_professional_services_payroll: boolean
  }[]
  const userById = new Map(users.map((u) => [u.id, u]))

  // Tarifa por terapia desde el catálogo (cost_usd = pago a la terapista).
  const { data: catalogRaw } = await supabase
    .from('service_catalog')
    .select('service_type, cost_usd')
    .eq('category', 'terapia_individual')
    .eq('active', true)
  const costByService = new Map<string, number>()
  for (const c of catalogRaw ?? []) {
    if (c.service_type) costByService.set(c.service_type, Number(c.cost_usd ?? 0))
  }

  // Tarifa por tipo de evaluación, indexada por código (cost_usd del catálogo).
  const { data: evalCatalogRaw } = await supabase
    .from('service_catalog')
    .select('code, cost_usd')
    .in('category', ['evaluacion', 'evaluacion_dx_tea', 'evaluacion_psicologica'])
    .eq('active', true)
  const costByEvalCode = new Map<string, number>()
  for (const c of evalCatalogRaw ?? []) {
    if (c.code) costByEvalCode.set(c.code, Number(c.cost_usd ?? 0))
  }

  // Terapias + evaluaciones completadas en la ventana.
  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('id, therapist_id, service_type, service_code, external_child_name, event_type, starts_at, ends_at, is_extra, extra_reason, children(full_name)')
    .in('event_type', ['terapia', 'evaluacion'])
    .eq('status', 'completed')
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at')
  const appts = (apptsRaw ?? []) as unknown as ApptJoinRow[]

  // Costo por cita: evaluaciones por su código; terapias por service_type.
  const costOfAppt = (a: ApptJoinRow): number =>
    a.event_type === 'evaluacion'
      ? costByEvalCode.get(a.service_code ?? '') ?? 0
      : costByService.get(a.service_type ?? '') ?? 0

  // Pago acumulado por terapista (puro).
  const payInput: CompletedTherapyForPay[] = appts.map((a) => ({
    therapist_id: a.therapist_id,
    service_type: a.service_type,
    is_extra: a.is_extra,
    cost_override: a.event_type === 'evaluacion' ? costOfAppt(a) : null,
  }))
  const totals = sumProfessionalServicesPay(payInput, costByService)

  // Agrupar filas por terapista.
  const rowsByTherapist = new Map<string, CompletedTherapyRow[]>()
  for (const a of appts) {
    if (!a.therapist_id) continue
    const durationMin = Math.max(
      0,
      (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000,
    )
    const row: CompletedTherapyRow = {
      appointmentId: a.id,
      childName: childNameOf(a),
      serviceType: a.service_type,
      startsAt: a.starts_at,
      durationMin,
      isExtra: a.is_extra,
      extraReason: a.extra_reason,
      costUsd: costOfAppt(a),
    }
    const arr = rowsByTherapist.get(a.therapist_id) ?? []
    arr.push(row)
    rowsByTherapist.set(a.therapist_id, arr)
  }

  const groups: TherapistCompletedGroup[] = []
  for (const [therapistId, rows] of rowsByTherapist) {
    const u = userById.get(therapistId)
    const inProfessionalServices = !!u?.in_professional_services_payroll
    const inNormalPayroll = !!u?.in_normal_payroll
    const extraOnly = inProfessionalServices && inNormalPayroll
    const completedCount = rows.length
    const totalHours = round2(rows.reduce((s, r) => s + r.durationMin, 0) / 60)
    const extraCount = rows.filter((r) => r.isExtra).length
    const payableCount = !inProfessionalServices ? 0 : extraOnly ? extraCount : completedCount
    const amountUsd = inProfessionalServices
      ? professionalServicesBaseFor(therapistId, inNormalPayroll, totals)
      : 0
    groups.push({
      therapistId,
      fullName: u?.full_name ?? 'Terapista',
      inProfessionalServices,
      extraOnly,
      rows,
      completedCount,
      totalHours,
      payableCount,
      amountUsd,
    })
  }

  groups.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))
  const totalUsd = round2(groups.reduce((s, g) => s + g.amountUsd, 0))

  return {
    granularity,
    rangeLabel: label,
    windowStartISO: startISO,
    windowEndISO: endISO,
    groups,
    totalUsd,
  }
}
