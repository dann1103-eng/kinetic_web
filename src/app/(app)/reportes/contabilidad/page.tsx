import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable']

interface SubCard {
  title: string
  description: string
  icon: string
  href?: string
  active: boolean
}

const CARDS: SubCard[] = [
  {
    title: 'Planillas',
    description: 'Generación mensual de planilla con ISSS, AFP e ISR. Sellado del período, firma del empleado y recibo individual descargable.',
    icon: 'receipt_long',
    href: '/reportes/contabilidad/planillas',
    active: true,
  },
  {
    title: 'Configuración fiscal y salarios',
    description: 'Constantes legales SV (ISSS, AFP, ISR), tarifas por empleado, datos fiscales (DUI, ISSS, AFP).',
    icon: 'tune',
    href: '/reportes/contabilidad/configuracion',
    active: true,
  },
]

export default async function ContabilidadLandingPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Contabilidad y planillas" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Reportes
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Contabilidad</span>
        </div>

        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Contabilidad y planillas
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Gestión de planillas mensuales con cálculo de ISSS, AFP e ISR (El Salvador), sellado de período y firma digital del empleado.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARDS.map((c) => (
            <Link
              key={c.title}
              href={c.href!}
              className="flex items-start gap-4 rounded-2xl border border-fm-outline-variant/40 bg-fm-background p-6 hover:border-fm-primary hover:shadow-md transition-all"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
                style={{ backgroundColor: '#00675c' }}
              >
                <span className="material-symbols-outlined text-white" style={{ fontSize: '24px' }}>
                  {c.icon}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-extrabold text-fm-on-surface">{c.title}</h2>
                <p className="text-sm text-fm-on-surface-variant mt-1 leading-relaxed">
                  {c.description}
                </p>
              </div>
              <span className="material-symbols-outlined text-fm-on-surface-variant self-center">
                arrow_forward
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
