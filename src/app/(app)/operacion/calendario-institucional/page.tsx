import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { listInstitutionalClosures } from '@/app/actions/institutional-calendar'
import { CalendarioInstitucionalClient } from './CalendarioInstitucionalClient'

export const dynamic = 'force-dynamic'

/** Ver el calendario: mismos roles que gestionan agenda y ciclos. */
const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]
/** Cargar cierres (mismo gate que `addInstitutionalClosure`). */
const CAN_EDIT_ROLES = ['admin', 'directora']

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export default async function CalendarioInstitucionalPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { year: yearParam } = await searchParams
  const currentYear = new Date().getFullYear()
  const year = Number(yearParam) || currentYear
  const closures = await listInstitutionalClosures(year)

  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fm-on-surface">Calendario institucional</h1>
        <p className="mt-1 text-sm text-fm-on-surface-variant">
          Asuetos, cierres y vacaciones del centro. Al generar el ciclo de un niño, estas fechas se
          saltan automáticamente: no se agendan ni se cobran. Un mes sin cierres cargados se agenda
          completo, así que conviene dejar el año listo antes de empezar a generar ciclos.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/operacion/calendario-institucional?year=${y}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              y === year
                ? 'bg-fm-primary text-white'
                : 'border border-fm-outline-variant/30 text-fm-on-surface hover:bg-fm-surface-container'
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      <CalendarioInstitucionalClient
        year={year}
        closures={closures}
        canEdit={CAN_EDIT_ROLES.includes(ctx.appUser.role)}
        canDelete={ctx.appUser.role === 'admin'}
      />
    </div>
  )
}
