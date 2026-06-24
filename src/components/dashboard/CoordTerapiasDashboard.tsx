import Link from 'next/link'
import type { CoordTerapiasDashboardData } from '@/lib/domain/global-dashboard'
import { QuickLinks } from './MgmtDashboard'
import { DashboardAlertsBanner } from './DashboardAlertsBanner'

interface Props {
  data: CoordTerapiasDashboardData
  greeting: string
}

export function CoordTerapiasDashboard({ data, greeting }: Props) {
  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fm-on-surface">{greeting}</h1>
        <p className="text-sm text-fm-on-surface-variant">Coordinación de terapias</p>
      </div>

      <DashboardAlertsBanner />

      {/* KPIs operativos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          label="Citas hoy"
          value={data.todayCount}
          tone="info"
          href="/agenda"
        />
        <Card
          label="Citas esta semana (7d)"
          value={data.weekCount}
          tone="info"
          href="/agenda"
        />
        <Card
          label="Inasistencias por reagendar"
          value={data.pendingAbsences}
          tone={data.pendingAbsences > 0 ? 'warn' : 'ok'}
          href={data.pendingAbsences > 0 ? '/aprobaciones' : undefined}
        />
        <Card
          label="En lista de espera"
          value={data.waitlistTotal}
          tone={data.waitlistUrgentStale > 0 ? 'warn' : 'info'}
          href="/operacion/lista-de-espera"
        />
      </div>

      {data.waitlistUrgentStale > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-600">priority_high</span>
          <p className="text-sm font-medium text-amber-900 flex-1">
            {data.waitlistUrgentStale} {data.waitlistUrgentStale === 1 ? 'entrada urgente' : 'entradas urgentes'} en lista de espera sin atender hace +14 días.
          </p>
          <Link
            href="/operacion/lista-de-espera?status=waiting"
            className="text-xs font-semibold text-amber-900 hover:underline"
          >
            Revisar →
          </Link>
        </div>
      )}

      {/* Niños sin plan */}
      {data.childrenWithoutPlan.length > 0 && (
        <Section
          title={`Niños activos sin plan de tratamiento (${data.childrenWithoutPlan.length})`}
          tone="warn"
          help="Estos niños están en treatment_status='active' pero no tienen ficha de acuerdo. Sin plan no se pueden generar ciclos mensuales."
        >
          <ChildList items={data.childrenWithoutPlan} action="Crear plan" />
        </Section>
      )}

      {/* Niños con plan sin terapista */}
      {data.childrenWithoutTherapist.length > 0 && (
        <Section
          title={`Niños con plan sin terapista asignada (${data.childrenWithoutTherapist.length})`}
          tone="warn"
          help="El plan existe pero alguna terapia activa (no matutina) no tiene terapista asignada. Bloquea la generación del ciclo mensual."
        >
          <ChildList items={data.childrenWithoutTherapist} action="Asignar terapista" />
        </Section>
      )}

      {data.childrenWithoutPlan.length === 0 && data.childrenWithoutTherapist.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Todos los niños activos tienen plan de tratamiento con terapista asignada. ✓
        </div>
      )}

      <QuickLinks
        items={[
          { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
          { href: '/aprobaciones', label: 'Reposiciones', icon: 'event_repeat' },
          { href: '/familias', label: 'Familias', icon: 'groups' },
        ]}
      />
    </div>
  )
}

function Card({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: number
  tone: 'ok' | 'info' | 'warn'
  href?: string
}) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
  }[tone]
  const inner = (
    <div className={`rounded-xl border p-4 ${colors} ${href ? 'hover:shadow-md cursor-pointer' : ''}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function Section({
  title,
  tone,
  help,
  children,
}: {
  title: string
  tone: 'warn' | 'info'
  help?: string
  children: React.ReactNode
}) {
  const border = tone === 'warn' ? 'border-amber-200 bg-amber-50/50' : 'border-fm-outline-variant/20'
  return (
    <section className={`rounded-2xl border p-5 ${border}`}>
      <h2 className="text-sm font-semibold text-fm-on-surface mb-1">{title}</h2>
      {help && <p className="text-xs text-fm-on-surface-variant mb-3">{help}</p>}
      {children}
    </section>
  )
}

function ChildList({
  items,
  action,
}: {
  items: { id: string; full_name: string; family_id: string }[]
  action: string
}) {
  return (
    <ul className="divide-y divide-fm-outline-variant/15">
      {items.map((c) => (
        <li
          key={c.id}
          className="py-2 flex items-center justify-between gap-3 text-sm"
        >
          <span className="text-fm-on-surface">{c.full_name}</span>
          <Link
            href={`/familias/${c.family_id}/children/${c.id}`}
            className="text-xs text-fm-primary hover:underline"
          >
            {action} →
          </Link>
        </li>
      ))}
    </ul>
  )
}
