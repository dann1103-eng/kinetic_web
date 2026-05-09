import { redirect, notFound } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { TemplateEditor } from '@/components/admin/plantillas/TemplateEditor'
import { getReportTemplate } from '@/app/actions/report-templates'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['directora', 'admin']

export default async function EditarPlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { id } = await params
  const template = await getReportTemplate(id)
  if (!template) notFound()

  return (
    <div className="min-h-screen bg-fm-surface">
      <TopNav title="Editar plantilla" backHref="/admin/plantillas" />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold text-fm-on-surface mb-6">
          Editar plantilla: {template.name}
        </h1>
        <TemplateEditor mode="edit" template={template} />
      </div>
    </div>
  )
}
