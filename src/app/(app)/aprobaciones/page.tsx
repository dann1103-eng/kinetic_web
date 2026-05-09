import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { SessionReportApprovalList } from '@/components/aprobaciones/SessionReportApprovalList'
import { ProgressReportApprovalList } from '@/components/aprobaciones/ProgressReportApprovalList'
import { PendingByTherapistSummary } from '@/components/aprobaciones/PendingByTherapistSummary'
import { detectPendingProgressReportsAllTherapists } from '@/lib/domain/progress-reports-pending'
import type { SessionReport, ProgressReport, ReportTemplate } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['directora', 'admin']

export default async function AprobacionesPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()

  // ─── Session reports submitted ────────────────────────────────────────────
  const { data: sessionReportsRaw } = await supabase
    .from('session_reports')
    .select('*')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const sessionReports = (sessionReportsRaw ?? []) as SessionReport[]

  // ─── Progress reports submitted ───────────────────────────────────────────
  const { data: progressReportsRaw } = await supabase
    .from('progress_reports')
    .select('*')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const progressReports = (progressReportsRaw ?? []) as ProgressReport[]

  // ─── Enrich (one round trip per join) ─────────────────────────────────────
  const allChildIds = Array.from(
    new Set([
      ...sessionReports.map((r) => r.child_id),
      ...progressReports.map((r) => r.child_id),
    ]),
  )
  const allUserIds = Array.from(
    new Set([
      ...sessionReports.map((r) => r.therapist_id).filter(Boolean) as string[],
      ...progressReports.map((r) => r.authored_by_user_id).filter(Boolean) as string[],
    ]),
  )
  const sessionApptIds = Array.from(new Set(sessionReports.map((r) => r.appointment_id)))

  const [childrenRes, usersRes, appointmentsRes] = await Promise.all([
    allChildIds.length
      ? supabase.from('children').select('id, full_name, preferred_name').in('id', allChildIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; preferred_name: string | null }[] }),
    allUserIds.length
      ? supabase.from('users').select('id, full_name').in('id', allUserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    sessionApptIds.length
      ? supabase.from('appointments').select('id, starts_at, service_type').in('id', sessionApptIds)
      : Promise.resolve({ data: [] as { id: string; starts_at: string; service_type: string | null }[] }),
  ])

  const childMap = Object.fromEntries(
    (childrenRes.data ?? []).map((c: { id: string; full_name: string; preferred_name: string | null }) => [
      c.id,
      c,
    ]),
  )
  const userMap = Object.fromEntries(
    (usersRes.data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]),
  )
  const appointmentMap = Object.fromEntries(
    (appointmentsRes.data ?? []).map((a: { id: string; starts_at: string; service_type: string | null }) => [
      a.id,
      a,
    ]),
  )

  // Templates referenciados por los progress reports en bandeja
  const templateIds = Array.from(
    new Set(progressReports.map((r) => r.template_id).filter(Boolean) as string[]),
  )
  const { data: templatesRaw } = templateIds.length
    ? await supabase.from('report_templates').select('*').in('id', templateIds)
    : { data: [] as ReportTemplate[] }
  const templateMap = Object.fromEntries(
    ((templatesRaw ?? []) as ReportTemplate[]).map((t) => [t.id, t]),
  )

  // Pendientes de informes de avances por terapista (Fase 3-C4 opción B).
  const pendingProgressByTherapist = await detectPendingProgressReportsAllTherapists(supabase)
  const pendingChildIds = Array.from(
    new Set(pendingProgressByTherapist.flatMap((g) => g.pending.map((p) => p.childId))),
  )
  let pendingFamilyIdByChild: Record<string, string> = {}
  if (pendingChildIds.length > 0) {
    const { data: pendingChildrenRaw } = await supabase
      .from('children')
      .select('id, family_id')
      .in('id', pendingChildIds)
    pendingFamilyIdByChild = Object.fromEntries(
      (pendingChildrenRaw ?? []).map((c) => [c.id, c.family_id]),
    )
  }

  const totalPending = sessionReports.length + progressReports.length

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Aprobaciones pendientes" />
      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-8">
        <PendingByTherapistSummary
          groups={pendingProgressByTherapist}
          familyIdByChild={pendingFamilyIdByChild}
        />
        {totalPending === 0 ? (
          <div className="py-20 text-center text-sm text-fm-on-surface-variant">
            Bandeja al día. No hay reportes ni informes esperando aprobación.
          </div>
        ) : (
          <>
            {progressReports.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-fm-on-surface">
                  Informes de avances · {progressReports.length}
                </h2>
                <ProgressReportApprovalList
                  reports={progressReports}
                  childMap={childMap}
                  authorMap={userMap}
                  templateMap={templateMap}
                />
              </section>
            )}

            {sessionReports.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-fm-on-surface">
                  Reportes de sesión · {sessionReports.length}
                </h2>
                <SessionReportApprovalList
                  reports={sessionReports}
                  childMap={childMap}
                  therapistMap={userMap}
                  appointmentMap={appointmentMap}
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
