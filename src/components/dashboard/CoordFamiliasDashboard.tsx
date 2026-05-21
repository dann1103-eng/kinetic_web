import Link from 'next/link'
import { INTAKE_PHASE_LABELS } from '@/types/db'
import type { IntakePhase } from '@/types/db'
import { QuickLinks } from './MgmtDashboard'
import { DashboardAlertsBanner } from './DashboardAlertsBanner'

interface Props {
  greeting: string
  childrenByIntakePhase: { phase: string; count: number }[]
  totalActive: number
}

function intakeLabel(p: string): string {
  return INTAKE_PHASE_LABELS[p as IntakePhase] ?? p
}

const PRE_THERAPY_PHASES = new Set([
  'solicitud_informacion',
  'bateria_preguntas',
  'entrevista_directora',
  'propuesta_observacion_evaluacion',
  'propuesta_economica_evaluacion',
  'agenda_observacion',
  'en_observacion_evaluacion',
  'informe_resultados',
  'propuesta_plan_terapias',
  'propuesta_economica_terapias',
])

export function CoordFamiliasDashboard({
  greeting,
  childrenByIntakePhase,
  totalActive,
}: Props) {
  const inFunnel = childrenByIntakePhase
    .filter((p) => PRE_THERAPY_PHASES.has(p.phase))
    .reduce((s, p) => s + p.count, 0)

  const inTherapy =
    childrenByIntakePhase.find((p) => p.phase === 'en_terapias')?.count ?? 0

  const discharged =
    childrenByIntakePhase.find((p) => p.phase === 'alta')?.count ?? 0

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
