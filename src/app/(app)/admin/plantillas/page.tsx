import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listReportTemplates } from '@/app/actions/report-templates'
import { TemplateList } from '@/components/admin/plantillas/TemplateList'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['directora', 'admin']

export default async function PlantillasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const templates = await listReportTemplates({ kind: 'progress', activeOnly: false })

  return (
    <div className="min-h-screen bg-fm-surface">
      <TopNav title="Plantillas de informes" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-fm-on-surface">Plantillas de informes</h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              Gestionar las plantillas de informes de avances. Las terapistas usan estas plantillas al crear nuevos informes.
            </p>
          </div>
          <Link
            href="/admin/plantillas/nueva"
            className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Nueva plantilla
          </Link>
        </div>

        <TemplateList templates={templates} />
      </div>
    </div>
  )
}
