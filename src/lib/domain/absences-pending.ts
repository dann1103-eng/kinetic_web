/**
 * Detección de inasistencias pendientes para el terapista — Kinetic Fase 4.
 *
 * El terapista no resuelve absences (eso es potestad de admin/directora/
 * coordinadora), pero sí necesita visibilidad sobre qué inasistencias de
 * sus alumnos están aún pendientes de reagendar para poder proponer
 * horarios o recordar a la directora.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType } from '@/types/db'
import { isAbsenceExpired } from './absence'

export interface PendingAbsenceItem {
  absenceId: string
  appointmentId: string
  childId: string
  childName: string
  serviceType: ServiceType | null
  originalStartsAt: string
  reportedAt: string
  reason: string | null
}

/**
 * Devuelve las inasistencias del terapista que aún están en estado
 * `pending` y dentro de la ventana en la que es posible reponer
 * (no vencidas).
 */
export async function detectPendingAbsencesForTherapist(
  supabase: SupabaseClient<Database>,
  therapistId: string,
  now: Date = new Date(),
): Promise<PendingAbsenceItem[]> {
  const { data: absencesRaw } = await supabase
    .from('appointment_absences')
    .select('id, appointment_id, child_id, reported_at, reason')
    .eq('therapist_id', therapistId)
    .eq('status', 'pending')
    .order('reported_at', { ascending: true })

  const absences = absencesRaw ?? []
  if (absences.length === 0) return []

  // Filtrar vencidas — el terapista no las puede empujar a reponer.
  const live = absences.filter((a) => !isAbsenceExpired(a.reported_at, now))
  if (live.length === 0) return []

  const childIds = Array.from(new Set(live.map((a) => a.child_id)))
  const apptIds = Array.from(new Set(live.map((a) => a.appointment_id)))

  const [childrenRes, apptsRes] = await Promise.all([
    supabase.from('children').select('id, full_name, preferred_name').in('id', childIds),
    supabase.from('appointments').select('id, starts_at, service_type').in('id', apptIds),
  ])

  const childMap = new Map(
    (childrenRes.data ?? []).map((c) => [c.id, c]),
  )
  const apptMap = new Map(
    (apptsRes.data ?? []).map((a) => [a.id, a]),
  )

  return live.map((a) => {
    const child = childMap.get(a.child_id)
    const appt = apptMap.get(a.appointment_id)
    return {
      absenceId: a.id,
      appointmentId: a.appointment_id,
      childId: a.child_id,
      childName: child?.preferred_name ?? child?.full_name ?? 'Niño/a',
      serviceType: (appt?.service_type as ServiceType | null) ?? null,
      originalStartsAt: appt?.starts_at ?? a.reported_at,
      reportedAt: a.reported_at,
      reason: a.reason,
    }
  })
}
