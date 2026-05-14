import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { ProgressReportFileUploader } from '@/components/agenda/ProgressReportFileUploader'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { Child, ProgressReport, ServiceType } from '@/types/db'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string; childId: string; reportId: string }>
}

const APPROVER_ROLES = ['admin', 'directora']

export default async function ProgressReportEditPage({ params }: PageProps) {
  const { id: familyId, childId, reportId } = await params
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  const [{ data: childRaw }, { data: reportRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('*')
      .eq('id', childId)
      .eq('family_id', familyId)
      .maybeSingle(),
    supabase
      .from('progress_reports')
      .select('*')
      .eq('id', reportId)
      .eq('child_id', childId)
      .maybeSingle(),
  ])

  if (!childRaw || !reportRaw) notFound()
  const child = childRaw as Child
  const report = reportRaw as ProgressReport

  let authorName = '—'
  if (report.authored_by_user_id) {
    const { data: author } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', report.authored_by_user_id)
      .maybeSingle()
    authorName = (author as { full_name: string } | null)?.full_name ?? '—'
  }

  const serviceLabel =
    SERVICE_TYPE_LABELS[report.service_type as ServiceType] ?? report.service_type

  const childName = child.preferred_name ?? child.full_name
  const canApprove = APPROVER_ROLES.includes(ctx.appUser.role)
  const isAuthor = report.authored_by_user_id === ctx.appUser.id

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav
        title={`Informe ${serviceLabel} — ${childName}`}
        backHref={`/familias/${familyId}/children/${childId}`}
      />
      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-3xl mx-auto w-full">
        <ProgressReportFileUploader
          report={report}
          childName={childName}
          serviceLabel={serviceLabel}
          authorName={authorName}
          canApprove={canApprove}
          isAuthor={isAuthor}
          backHref={`/familias/${familyId}/children/${childId}`}
        />
      </div>
    </div>
  )
}
