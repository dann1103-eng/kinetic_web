/**
 * Detección de informes de avances pendientes (Fase 3-C4 opción B).
 *
 * Una "terapia activa" del terapista (par child_id × service_type) está pendiente
 * de informe cuando:
 *   1. Tuvo al menos una cita de tipo 'terapia' en los últimos 4 meses con este
 *      terapista, y
 *   2. El niño/a tiene treatment_status='active', y
 *   3. NO existe un progress_report para ese par cuyo period_ends caiga dentro
 *      de los últimos 4 meses con status en (submitted | approved | sent_to_family).
 *
 * Ventana: rolling (no calendar) — [hoy - 4 meses, hoy] en zona América/El_Salvador.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const TZ = 'America/El_Salvador'
const PERIOD_MONTHS = 4

export interface PendingProgressReportItem {
  childId: string
  childName: string
  serviceType: string
  /** Última cita de esta terapia (más reciente en la ventana). */
  lastAppointmentAt: string
}

/** Estado del informe de avances de un par (child × service) en la ventana actual. */
export type ActiveTherapyReportStatus =
  | 'none'           // no hay informe → PENDIENTE
  | 'draft'          // terapista dejó borrador → PENDIENTE (todavía no envió)
  | 'rejected'       // directora rechazó → PENDIENTE (debe corregir)
  | 'submitted'      // esperando aprobación → ya no pendiente, está en revisión
  | 'approved'       // aprobado, no visible a familia
  | 'sent_to_family' // aprobado y enviado a la familia

export interface ActiveTherapySummary {
  childId: string
  childName: string
  serviceType: string
  lastAppointmentAt: string
  reportStatus: ActiveTherapyReportStatus
  reportId: string | null
}

/** Inicio de la ventana actual: hoy menos PERIOD_MONTHS, en la TZ local. */
export function currentPeriodStart(now: Date = new Date()): Date {
  const localNow = toZonedTime(now, TZ)
  const start = new Date(
    localNow.getFullYear(),
    localNow.getMonth() - PERIOD_MONTHS,
    localNow.getDate(),
    0,
    0,
    0,
  )
  return fromZonedTime(start, TZ)
}

/**
 * Devuelve TODAS las terapias activas (par child × service) que dio el
 * terapista en la ventana actual, con el estado del informe de cada una.
 * Esta es la función "completa": las queries Q1/Q2/Q3 se reflejan acá.
 */
export async function summarizeActiveTherapiesForTherapist(
  supabase: SupabaseClient<Database>,
  therapistId: string,
  now: Date = new Date(),
): Promise<ActiveTherapySummary[]> {
  const periodStart = currentPeriodStart(now)
  const periodStartIso = periodStart.toISOString()
  const periodStartDate = periodStart.toISOString().slice(0, 10)

  // Q1. Citas de terapia del terapista en la ventana, con service_type definido.
  const { data: appointments } = await supabase
    .from('appointments')
    .select('child_id, service_type, starts_at')
    .eq('therapist_id', therapistId)
    .eq('event_type', 'terapia')
    .gte('starts_at', periodStartIso)
    .not('service_type', 'is', null)
    .order('starts_at', { ascending: false })

  if (!appointments || appointments.length === 0) return []

  // Único (child, service) → guardar la última cita.
  const pairs = new Map<string, { childId: string; serviceType: string; lastAt: string }>()
  for (const a of appointments) {
    if (!a.child_id || !a.service_type) continue
    const key = `${a.child_id}|${a.service_type}`
    if (!pairs.has(key)) {
      pairs.set(key, {
        childId: a.child_id,
        serviceType: a.service_type,
        lastAt: a.starts_at,
      })
    }
  }
  if (pairs.size === 0) return []

  const childIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.childId)))

  // Q2. Solo niños activos = en terapia (3.3) o en seguimiento (4.x).
  // EXCLUYE niños del programa matutino BlueKids — no requieren informes
  // cuatrimestrales individuales por terapia (es un programa grupal matutino).
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name, current_phase_code, enrolled_program')
    .in('id', childIds)

  const activeChildById = new Map<string, { full_name: string; preferred_name: string | null }>()
  for (const c of (childrenRaw ?? []) as Array<{
    id: string
    full_name: string
    preferred_name: string | null
    current_phase_code: string | null
    enrolled_program: string | null
  }>) {
    const isActive =
      c.current_phase_code === '3_3_activo_en_terapias' ||
      (c.current_phase_code?.startsWith('4_') ?? false)
    const isBlueKids = c.enrolled_program === 'blue_kids'
    if (isActive && !isBlueKids) {
      activeChildById.set(c.id, { full_name: c.full_name, preferred_name: c.preferred_name })
    }
  }
  if (activeChildById.size === 0) return []

  // Q2b. El informe cuatrimestral lo hace la terapista ASIGNADA a ese tipo de
  // terapia en el plan (treatment_plans.therapies_json[].therapist_id). Ya no hay
  // "terapista principal": cada par (niño × servicio) le pertenece a quien tiene
  // ese servicio asignado. Filtramos los pares a solo los que esta terapista
  // tiene asignados.
  const { data: plansRaw } = await supabase
    .from('treatment_plans')
    .select('child_id, therapies_json')
    .in('child_id', Array.from(activeChildById.keys()))
    .eq('active', true)

  const assignedPairs = new Set<string>()
  for (const p of plansRaw ?? []) {
    const therapies = (p.therapies_json ?? []) as Array<{
      service?: string
      therapist_id?: string | null
      active?: boolean
    }>
    for (const t of therapies) {
      if (t.therapist_id === therapistId && t.active !== false && t.service) {
        assignedPairs.add(`${p.child_id}|${t.service}`)
      }
    }
  }

  // Conservar solo los pares (niño × servicio) asignados a esta terapista.
  for (const key of Array.from(pairs.keys())) {
    if (!assignedPairs.has(key)) pairs.delete(key)
  }
  if (pairs.size === 0) return []

  // Re-derivar los niños activos a partir de los pares que sobreviven.
  const remainingChildIds = new Set(Array.from(pairs.values()).map((p) => p.childId))
  for (const id of Array.from(activeChildById.keys())) {
    if (!remainingChildIds.has(id)) activeChildById.delete(id)
  }
  if (activeChildById.size === 0) return []

  // Q3. Progress reports existentes en la ventana (cualquier estado, para mostrar
  // estado real). El "más reciente por par" se queda con el de mayor period_ends.
  const serviceTypes = Array.from(new Set(Array.from(pairs.values()).map((p) => p.serviceType)))
  const { data: existingReports } = await supabase
    .from('progress_reports')
    .select('id, child_id, service_type, status, period_ends')
    .in('child_id', Array.from(activeChildById.keys()))
    .in('service_type', serviceTypes)
    .gte('period_ends', periodStartDate)
    .order('period_ends', { ascending: false })

  const latestReportByPair = new Map<
    string,
    { id: string; status: ActiveTherapyReportStatus }
  >()
  for (const r of existingReports ?? []) {
    const key = `${r.child_id}|${r.service_type}`
    if (latestReportByPair.has(key)) continue // ya tomamos el más reciente
    latestReportByPair.set(key, {
      id: r.id,
      status: r.status as ActiveTherapyReportStatus,
    })
  }

  // 4. Combinar: para cada par activo, devolver su estado.
  const summary: ActiveTherapySummary[] = []
  for (const [key, p] of pairs) {
    const child = activeChildById.get(p.childId)
    if (!child) continue
    const report = latestReportByPair.get(key)
    summary.push({
      childId: p.childId,
      childName: child.preferred_name ?? child.full_name,
      serviceType: p.serviceType,
      lastAppointmentAt: p.lastAt,
      reportStatus: report?.status ?? 'none',
      reportId: report?.id ?? null,
    })
  }

  summary.sort((a, b) => {
    const n = a.childName.localeCompare(b.childName, 'es')
    if (n !== 0) return n
    return a.serviceType.localeCompare(b.serviceType, 'es')
  })

  return summary
}

/** Estados que CUENTAN como informe pendiente (no hay informe enviado/aprobado). */
const PENDING_STATUSES: ActiveTherapyReportStatus[] = ['none', 'draft', 'rejected']

export function isPendingStatus(s: ActiveTherapyReportStatus): boolean {
  return PENDING_STATUSES.includes(s)
}

/** Wrapper retro-compatible: solo los pares pendientes. */
export async function detectPendingProgressReportsForTherapist(
  supabase: SupabaseClient<Database>,
  therapistId: string,
  now: Date = new Date(),
): Promise<PendingProgressReportItem[]> {
  const summary = await summarizeActiveTherapiesForTherapist(supabase, therapistId, now)
  return summary
    .filter((s) => isPendingStatus(s.reportStatus))
    .map((s) => ({
      childId: s.childId,
      childName: s.childName,
      serviceType: s.serviceType,
      lastAppointmentAt: s.lastAppointmentAt,
    }))
}

export interface PendingByTherapist {
  therapistId: string
  therapistName: string
  pending: PendingProgressReportItem[]
}

/**
 * Agrupado por terapista — para vista de directora en /aprobaciones.
 * Recorre todos los terapistas con citas activas en la ventana.
 */
export async function detectPendingProgressReportsAllTherapists(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<PendingByTherapist[]> {
  const periodStartIso = currentPeriodStart(now).toISOString()

  // Universo de terapistas con citas en la ventana.
  const { data: appts } = await supabase
    .from('appointments')
    .select('therapist_id')
    .eq('event_type', 'terapia')
    .gte('starts_at', periodStartIso)
    .not('therapist_id', 'is', null)

  const therapistIds = Array.from(
    new Set((appts ?? []).map((a) => a.therapist_id).filter(Boolean) as string[]),
  )
  if (therapistIds.length === 0) return []

  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', therapistIds)

  const namesById = new Map<string, string>(
    (usersRaw ?? []).map((u) => [u.id, u.full_name]),
  )

  const result: PendingByTherapist[] = []
  for (const tid of therapistIds) {
    const pending = await detectPendingProgressReportsForTherapist(supabase, tid, now)
    if (pending.length === 0) continue
    result.push({
      therapistId: tid,
      therapistName: namesById.get(tid) ?? '—',
      pending,
    })
  }

  result.sort((a, b) => a.therapistName.localeCompare(b.therapistName, 'es'))
  return result
}

