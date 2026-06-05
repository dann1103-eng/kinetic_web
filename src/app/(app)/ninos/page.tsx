import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { NinosPageClient } from '@/components/ninos/NinosPageClient'
import { getNinosDashboardData, getAvailableMonths } from '@/lib/domain/ninos-dashboard'
import { listPhaseCatalog } from '@/app/actions/intake-pipeline'

export const dynamic = 'force-dynamic'

// Terapistas y maestras NO ven el listado completo de niños — tienen su
// propia ruta /mis-ninos con solo los niños bajo su atención.
const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
  'contable',
]
const REDIRECT_TO_MY_KIDS = ['terapista', 'maestra']

export default async function NinosPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (REDIRECT_TO_MY_KIDS.includes(ctx.appUser.role)) redirect('/mis-ninos')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { month } = await searchParams
  const availableMonths = getAvailableMonths()
  const periodMonth =
    month && availableMonths.includes(month) ? month : availableMonths[0]

  const supabase = await createClient()
  const [dashboard, phaseCatalog] = await Promise.all([
    getNinosDashboardData(supabase, periodMonth),
    listPhaseCatalog(),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Niños" />
      <NinosPageClient
        niños={dashboard.niños}
        therapists={dashboard.therapists}
        periodMonth={periodMonth}
        availableMonths={availableMonths}
        phaseCatalog={phaseCatalog}
      />
    </div>
  )
}
