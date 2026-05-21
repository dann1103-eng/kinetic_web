import Link from 'next/link'
import { QuickLinks } from './MgmtDashboard'
import { DashboardAlertsBanner } from './DashboardAlertsBanner'

interface Props {
  greeting: string
  /** phase = código del catálogo (ej. "3_3_activo_en_terapias"). */
  childrenByIntakePhase: { phase: string; count: number }[]
  totalActive: number
}

/** Convierte un code "3_3_activo_en_terapias" → "3.3 Activo en terapias". */
function intakeLabel(code: string): string {
  const match = code.match(/^(\d+)_(\d+)_(.+)$/)
  if (!match) return code
  const [, group, order, slug] = match
  const human = slug.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  return `${group}.${order} ${human}`
}

/** Pre-terapia = grupos 1 y 2 (Primer contacto + Proceso de Admisión). */
function isPreTherapy(code: string): boolean {
  return code.startsWith('1_') || code.startsWith('2_')
}

export function CoordFamiliasDashboard({
  greeting,
  childrenByIntakePhase,
  totalActive,
}: Props) {
  const inFunnel = childrenByIntakePhase
    .filter((p) => isPreTherapy(p.phase))
    .reduce((s, p) => s + p.count, 0)

  const inTherapy =
    childrenByIntakePhase.find((p) => p.phase === '3_3_activo_en_terapias')?.count ?? 0

  const discharged =
    childrenByIntakePhase.find((p) => p.phase === '5_1_alta_terapeutica')?.count ?? 0

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fm-on-surface">{greeting}</h1>
        <p className="text-sm text-fm-on-surface-variant">Captación y seguimiento de familias</p>
      </div>

      <DashboardAlertsBanner />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Activos totales" value={totalActive} tone="info" />
        <Stat label="En proceso de intake" value={inFunnel} tone="warn" />
        <Stat label="En terapia" value={inTherapy} tone="ok" />
        <Stat label="Dados de alta" value={discharged} tone="ok" />
      </div>

      {/* Funnel de intake */}
      <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fm-on-surface">
            Niños activos por fase
          </h2>
          <Link href="/familias" className="text-xs text-fm-primary hover:underline">
            Ver familias →
          </Link>
        </div>
        {childrenByIntakePhase.length === 0 ? (
          <p className="text-sm text-fm-on-surface-variant">Sin niños activos.</p>
        ) : (
          <ul className="space-y-1.5">
            {childrenByIntakePhase.map((p) => (
              <li
                key={p.phase}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-fm-on-surface">{intakeLabel(p.phase)}</span>
                <span className="font-mono tabular-nums text-fm-on-surface-variant">
                  {p.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QuickLinks
        items={[
          { href: '/familias', label: 'Familias', icon: 'groups' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
          { href: '/usuarios-portal', label: 'Usuarios portal', icon: 'family_restroom' },
        ]}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'info' | 'warn'
}) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
  }[tone]
  return (
    <div className={`rounded-xl border p-4 ${colors}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
