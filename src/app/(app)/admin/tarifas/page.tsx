import { redirect } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listServiceCatalog } from '@/app/actions/service-catalog'
import { TarifasClient } from './TarifasClient'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'directora', 'supervisor']

export default async function TarifasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const isAdmin = ctx.appUser.role === 'admin'
  const result = await listServiceCatalog({ includeInactive: true })
  const items = result.ok ? result.data : []

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Tarifas" />
      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-[1280px] mx-auto w-full">
        <header className="mb-12 md:mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant mb-3">
            Catálogo
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fm-on-surface leading-none">
            Tarifas vigentes
          </h1>
          <p className="text-base text-fm-on-surface-variant mt-4 max-w-prose">
            Fuente única de precios para matrícula, mensualidades, materiales,
            uniformes, entrevistas, asesorías, evaluaciones y tests
            psicológicos. Los items que selecciones desde una factura toman su
            descripción y precio de aquí.
          </p>
        </header>

        <TarifasClient items={items} canEdit={isAdmin} />
      </div>
    </div>
  )
}
