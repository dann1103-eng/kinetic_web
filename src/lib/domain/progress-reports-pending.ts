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

export async function detectPendingProgressReportsForTherapist(
  supabase: SupabaseClient<Database>,
  therapistId: string,
  now: Date = new Date(),
): Promise<PendingProgressReportItem[]> {
  const periodStart = currentPeriodStart(now)
  const periodStartIso = periodStart.toISOString()
  const periodStartDate = periodStart.toISOString().slice(0, 10)

  // 1. Citas de terapia del terapista en la ventana, con service_type definido.
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

  // 2. Solo niños con treatment_status='active'.
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name, treatment_status')
    .in('id', childIds)

  const activeChildById = new Map<string, { full_name: string; preferred_name: string | null }>()
  for (const c of childrenRaw ?? []) {
    if (c.treatment_status === 'active') {
      activeChildById.set(c.id, { full_name: c.full_name, preferred_name: c.preferred_name })
    }
  }
  if (activeChildById.size === 0) return []

  // 3. Progress reports existentes en la ventana, en estados que cuentan como hecho.
  const serviceTypes = Array.from(new Set(Array.from(pairs.values()).map((p) => p.serviceType)))
  const { data: existingReports } = await supabase
    .from('progress_reports')
    .select('child_id, service_type, period_ends, status')
    .in('child_id', Array.from(activeChildById.keys()))
    .in('service_type', serviceTypes)
    .in('status', ['submitted', 'approved', 'sent_to_family'])
    .gte('period_ends', periodStartDate)

  const reportedPairs = new Set<string>()
  for (const r of existingReports ?? []) {
    reportedPairs.add(`${r.child_id}|${r.service_type}`)
  }

  // 4. Pendientes = pares activos sin reporte en la ventana.
  const pending: PendingProgressReportItem[] = []
  for (const [key, p] of pairs) {
    const child = activeChildById.get(p.childId)
    if (!child) continue
    if (reportedPairs.has(key)) continue
    pending.push({
      childId: p.childId,
      childName: child.preferred_name ?? child.full_name,
      serviceType: p.serviceType,
      lastAppointmentAt: p.lastAt,
    })
  }

  // Orden por nombre del niño + servicio para UI estable.
  pending.sort((a, b) => {
    const n = a.childName.localeCompare(b.childName, 'es')
    if (n !== 0) return n
    return a.serviceType.localeCompare(b.serviceType, 'es')
  })

  return pending
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

