import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { PortalJournalClient } from './PortalJournalClient'
import { SessionReportsList } from '@/components/portal/SessionReportsList'
import { ProgressReportsList } from '@/components/portal/ProgressReportsList'
import type {
  ChildJournalEntry,
  SessionReport,
  ProgressReport,
  ReportTemplate,
} from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PortalAgendaDigitalPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  const { data: familyUserRaw } = await supabase
    .from('family_users')
    .select('can_work')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()
  const familyUser = familyUserRaw as { can_work: boolean } | null

  if (!familyUser?.can_work) {
    return (
      <div className="flex flex-col min-h-full bg-fm-background">
        <TopNav title="Agenda digital" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-fm-on-surface-variant text-center max-w-xs">
            El acceso a la Agenda digital no está habilitado para esta cuenta.
            Contactá a Kinetic si creés que esto es un error.
          </p>
        </div>
      </div>
    )
  }

  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')

  const children = (childrenRaw ?? []) as {
    id: string
    full_name: string
    preferred_name: string | null
  }[]

  const childIds = children.map((c) => c.id)
  const entriesByChild: Record<string, ChildJournalEntry[]> = {}
  let sessionReports: SessionReport[] = []
  let progressReports: ProgressReport[] = []

  if (childIds.length > 0) {
    const { data: entriesRaw } = await supabase
      .from('child_journal_entries')
      .select('*')
      .in('child_id', childIds)
      .order('created_at', { ascending: false })

    for (const e of (entriesRaw ?? []) as ChildJournalEntry[]) {
      if (!entriesByChild[e.child_id]) entriesByChild[e.child_id] = []
      entriesByChild[e.child_id].push(e)
    }

    // Reportes de sesión enviados a la familia. RLS también filtra,
    // pero filtramos server-side para no traer datos extra al cliente.
    const { data: reportsRaw } = await supabase
      .from('session_reports')
      .select('id, session_id, child_id, actividades, respuesta_del_nino, tarea_para_casa, visible_to_family, status, sent_to_family_at')
      .in('child_id', childIds)
      .eq('status', 'sent_to_family')
      .eq('visible_to_family', true)
      .order('sent_to_family_at', { ascending: false })
      .limit(20)

    sessionReports = (reportsRaw ?? []) as SessionReport[]

    // Informes de avances cuatrimestrales aprobados.
    const { data: progressRaw } = await supabase
      .from('progress_reports')
      .select('*')
      .in('child_id', childIds)
      .eq('status', 'sent_to_family')
      .eq('visible_to_family', true)
      .order('sent_to_family_at', { ascending: false })
      .limit(20)

    progressReports = (progressRaw ?? []) as ProgressReport[]
  }

  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.preferred_name ?? c.full_name]),
  )

  // Cargar plantillas referenciadas por los progress reports visibles.
  const templateIds = Array.from(
    new Set(progressReports.map((r) => r.template_id).filter(Boolean) as string[]),
  )
  const { data: templatesRaw } = templateIds.length
    ? await supabase.from('report_templates').select('*').in('id', templateIds)
    : { data: [] as ReportTemplate[] }
  const templateMap: Record<string, ReportTemplate> = Object.fromEntries(
    ((templatesRaw ?? []) as ReportTemplate[]).map((t) => [t.id, t]),
  )

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Agenda digital" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-6">
        {progressReports.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-fm-on-surface uppercase tracking-wider">
              Informes de avances
            </h2>
            <ProgressReportsList
              reports={progressReports}
              childNamesById={childNamesById}
              templateMap={templateMap}
            />
          </section>
        )}

        {sessionReports.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-fm-on-surface uppercase tracking-wider">
              Reportes recientes
            </h2>
            <SessionReportsList reports={sessionReports} childNamesById={childNamesById} />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fm-on-surface uppercase tracking-wider">
            Agenda digital
          </h2>
          <PortalJournalClient
            childrenData={children}
            entriesByChild={entriesByChild}
          />
        </section>
      </div>
    </div>
  )
}
