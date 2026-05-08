import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { ProgressReportEditor } from '@/components/agenda/ProgressReportEditor'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { Child, ProgressReport, ServiceType } from '@/types/db'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string; childId: string; reportId: string }>
}

export default async function ProgressReportEditPage({ params }: PageProps) {
  const { id: familyId, childId, reportId } = await params
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  const [{ data: childRaw }, { data: reportRaw }] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).eq('family_id', familyId).maybeSingle(),
    supabase.from('progress_reports').select('*').eq('id', reportId).eq('child_id', childId).maybeSingle(),
  ])

  if (!childRaw || !reportRaw) notFound()
  const child = childRaw as Child
  const report = reportRaw as ProgressReport

  // Author name (terapista)
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

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav
        title={`Informe ${serviceLabel} — ${child.preferred_name ?? child.full_name}`}
        backHref={`/familias/${familyId}/children/${childId}`}
      />
      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full">
        <ProgressReportEditor
          report={report}
          child={{
            full_name: child.full_name,
            preferred_name: child.preferred_name,
            code: child.code,
            birth_date: child.birth_date,
            school_name: child.school_name,
            school_grade: child.school_grade,
            diagnoses_display_text: child.diagnoses_display_text,
          }}
          authorName={authorName}
          serviceLabel={serviceLabel}
        />
      </div>
    </div>
  )
}
