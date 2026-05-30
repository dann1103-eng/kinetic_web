import { redirect } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listServiceCatalog } from '@/app/actions/service-catalog'
import { CatalogosClient } from '@/components/catalogos/CatalogosClient'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'contable', 'recepcion']

export default async function CatalogosPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const res = await listServiceCatalog({ includeInactive: true })
  const items = res.ok ? res.data : []

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Catálogos" />
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-5">
        <header className="pt-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Catálogos
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Precios que se cobran a las familias y costos internos por terapia (pago a
            terapistas). Editá un valor y guardá la fila.
          </p>
        </header>

        {!res.ok && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            No se pudo cargar el catálogo.
          </div>
        )}

        <CatalogosClient items={items} />
      </div>
    </div>
  )
}
