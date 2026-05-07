import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { SessionReportApprovalList } from '@/components/aprobaciones/SessionReportApprovalList'
import type { SessionReport } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['directora', 'admin']

export default async function AprobacionesPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()

  const { data: reportsRaw } = await supabase
    .from('session_reports')
    .select('*')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const reports = (reportsRaw ?? []) as SessionReport[]

  // Enrich with child + therapist + appointment info.
  const childIds = Array.from(new Set(reports.map((r) => r.child_id)))
  const therapistIds = Array.from(
    new Set(reports.map((r) => r.therapist_id).filter(Boolean) as string[]),
  )
  const appointmentIds = Array.from(new Set(reports.map((r) => r.appointment_id)))

  const [childrenRes, therapistsRes, appointmentsRes] = await Promise.all([
    childIds.length
      ? supabase.from('children').select('id, full_name, preferred_name').in('id', childIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; preferred_name: string | null }[] }),
    therapistIds.length
      ? supabase.from('users').select('id, full_name').in('id', therapistIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    appointmentIds.length
      ? supabase.from('appointments').select('id, starts_at, service_type').in('id', appointmentIds)
      : Promise.resolve({ data: [] as { id: string; starts_at: string; service_type: string | null }[] }),
  ])

  const childMap = Object.fromEntries(
    (childrenRes.data ?? []).map((c: { id: string; full_name: string; preferred_name: string | null }) => [
      c.id,
      c,
    ]),
  )
  const therapistMap = Object.fromEntries(
    (therapistsRes.data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]),
  )
  const appointmentMap = Object.fromEntries(
    (appointmentsRes.data ?? []).map((a: { id: string; starts_at: string; service_type: string | null }) => [
      a.id,
      a,
    ]),
  )

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Aprobaciones pendientes" />
      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full">
        {reports.length === 0 ? (
          <div className="py-20 text-center text-sm text-fm-on-surface-variant">
            No hay reportes esperando aprobación.
          </div>
        ) : (
          <SessionReportApprovalList
            reports={reports}
            childMap={childMap}
            therapistMap={therapistMap}
            appointmentMap={appointmentMap}
          />
        )}
      </div>
    </div>
  )
}
