import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  getCompletedTherapiesDetail,
  type CompletedGranularity,
} from '@/lib/domain/reports/completed-therapies'
import { CompletedTherapiesView } from '@/components/operacion/CompletedTherapiesView'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
]

const TZ = 'America/El_Salvador'

interface PageProps {
  searchParams: Promise<{ g?: string; d?: string }>
}

function parseGranularity(s?: string): CompletedGranularity {
  return s === 'dia' || s === 'mes' ? s : 'semana'
}

function todaySV(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseAnchor(s?: string): string {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return todaySV()
}

export default async function CompletedTherapiesPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const granularity = parseGranularity(params.g)
  const anchorDate = parseAnchor(params.d)

  const supabase = await createClient()
  const report = await getCompletedTherapiesDetail(supabase, { granularity, anchorDate })
  const canEdit = ALLOWED_ROLES.includes(ctx.appUser.role)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Operación · Capacidad
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
          Horas completadas por terapista
        </h1>
        <p className="text-sm text-fm-on-surface-variant max-w-prose">
          Terapias completadas por día, semana o mes. Marcá las extraordinarias para que
          entren a la planilla de servicios profesionales.
        </p>
        <Link
          href="/operacion/capacidad-terapistas"
          className="inline-flex items-center gap-1 text-sm font-semibold text-fm-primary hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Volver a capacidad
        </Link>
      </header>

      <CompletedTherapiesView
        report={report}
        granularity={granularity}
        anchorDate={anchorDate}
        canEdit={canEdit}
      />
    </div>
  )
}
