import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion', 'coordinadora_terapias']

interface Card {
  title: string
  description: string
  icon: string
  href?: string
  active: boolean
}

const CARDS: Card[] = [
  {
    title: 'Financieros',
    description: 'Ingresos mensuales, ciclos cobrados vs anulados, comparativas anuales y distribución por método de pago.',
    icon: 'payments',
    href: '/reportes/financieros',
    active: true,
  },
  {
    title: 'Planillas',
    description: 'Planillas mensuales por empleado, deducciones (ISSS / AFP / ISR), firmas digitales de recepción y cierre de período.',
    icon: 'receipt_long',
    href: '/reportes/contabilidad',
    active: true,
  },
  {
    title: 'Por terapista',
    description: 'Productividad: sesiones realizadas, no-shows, reposiciones cumplidas, horas trabajadas vs contratadas y cumplimiento de informes cuatrimestrales.',
    icon: 'psychology',
    href: '/reportes/por-terapista',
    active: true,
  },
]

export default async function ReportesLandingPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Reportes" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <header className="pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Reportes Kinetic
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Elegí una categoría para ver el detalle. Las categorías marcadas como “Próximamente” se entregarán en sesiones siguientes.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARDS.map((card) => (
            <CategoryCard key={card.title} card={card} />
          ))}
        </div>
      </div>
    </div>
  )
}

function CategoryCard({ card }: { card: Card }) {
  const baseClasses =
    'flex items-start gap-4 rounded-2xl border p-6 transition-all'

  if (card.active && card.href) {
    return (
      <Link
        href={card.href}
        className={`${baseClasses} border-fm-outline-variant/40 bg-fm-background hover:border-fm-primary hover:shadow-md`}
      >
        <CardIcon icon={card.icon} active />
        <div className="flex-1">
          <h2 className="text-lg font-extrabold text-fm-on-surface">{card.title}</h2>
          <p className="text-sm text-fm-on-surface-variant mt-1 leading-relaxed">
            {card.description}
          </p>
        </div>
        <span className="material-symbols-outlined text-fm-on-surface-variant self-center">
          arrow_forward
        </span>
      </Link>
    )
  }

  return (
    <div
      className={`${baseClasses} border-fm-outline-variant/30 bg-fm-background/50 opacity-70 cursor-not-allowed`}
      aria-disabled="true"
    >
      <CardIcon icon={card.icon} active={false} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-fm-on-surface">{card.title}</h2>
          <span className="text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
            Próximamente
          </span>
        </div>
        <p className="text-sm text-fm-on-surface-variant mt-1 leading-relaxed">
          {card.description}
        </p>
      </div>
    </div>
  )
}

function CardIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
      style={{
        backgroundColor: active ? '#00675c' : '#cbd5e1',
      }}
    >
      <span
        className="material-symbols-outlined text-white"
        style={{ fontSize: '24px' }}
      >
        {icon}
      </span>
    </div>
  )
}
