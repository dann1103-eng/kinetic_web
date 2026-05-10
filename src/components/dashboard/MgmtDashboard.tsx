import Link from 'next/link'
import type { MgmtDashboardData } from '@/lib/domain/global-dashboard'
import type { MgmtWidgetsData } from '@/lib/domain/dashboard-widgets'
import { INTAKE_PHASE_LABELS } from '@/types/db'
import type { IntakePhase } from '@/types/db'
import { RevenueTrendSparkline } from './widgets/RevenueTrendSparkline'
import { CalendarHeatmap } from './widgets/CalendarHeatmap'
import { TopTherapists } from './widgets/TopTherapists'
import { AtRiskChildren } from './widgets/AtRiskChildren'
import { ChildReportsOverview } from './widgets/ChildReportsOverview'

interface Props {
  data: MgmtDashboardData
  widgets: MgmtWidgetsData
  greeting: string
  /** 0=domingo … 6=sábado, día 1 del mes actual */
  firstWeekdayOfMonth: number
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function intakeLabel(p: string): string {
  return INTAKE_PHASE_LABELS[p as IntakePhase] ?? p
}

export function MgmtDashboard({
  data,
  widgets,
  greeting,
  firstWeekdayOfMonth,
}: Props) {
  const totalPending =
    data.pendingCounts.progressReports +
    data.pendingCounts.sessionReports +
    data.pendingCounts.absences

  return (
    <div className="px-4 py-8 md:px-10 md:py-12 max-w-[1320px] mx-auto w-full">
      {/* Header editorial */}
      <header className="mb-12 md:mb-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant mb-3">
          Dashboard · {data.periodLabel}
        </p>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fm-on-surface leading-none">
          {greeting}
        </h1>
        <p className="text-base text-fm-on-surface-variant mt-4 max-w-prose">
          Vista panorámica del centro este mes: actividad clínica, ingresos,
          alertas y estado de los expedientes activos.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* ─── Rail izquierdo: KPIs + Alertas ───────────────────────────── */}
        <aside className="col-span-12 lg:col-span-4 lg:sticky lg:top-6 space-y-6">
          <div className="space-y-3">
            <KpiBlock
              label="Sesiones del mes"
              value={data.monthlyAppointments.total}
              subtitle={`${data.monthlyAppointments.completed} asistidas · ${data.monthlyAppointments.no_show} no-show`}
            />
            <KpiBlock
              label="Niños activos"
              value={data.activeChildren}
            />
            <KpiBlock
              label="Pendientes de aprobación"
              value={totalPending}
              tone={totalPending > 0 ? 'warn' : 'neutral'}
              href={totalPending > 0 ? '/aprobaciones' : undefined}
              subtitle={
                totalPending > 0
                  ? `${data.pendingCounts.progressReports} informes · ${data.pendingCounts.sessionReports} reportes · ${data.pendingCounts.absences} inasistencias`
                  : 'Todo al día'
              }
            />
          </div>

          <AtRiskChildren rows={widgets.childrenAtRisk} />
        </aside>

        {/* ─── Main: widgets variados ───────────────────────────────────── */}
        <main className="col-span-12 lg:col-span-8 space-y-12">
          <RevenueTrendSparkline
            series={widgets.revenueByDay}
            totalUsd={data.monthlyRevenueUsd}
            periodLabel={data.periodLabel}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CalendarHeatmap
              series={widgets.appointmentsHeatmap}
              periodLabel={data.periodLabel}
              firstWeekday={firstWeekdayOfMonth}
            />
            <TopTherapists rows={widgets.topTherapists} />
          </div>

          <ChildReportsOverview rows={widgets.childrenReports} />

          {data.childrenByIntakePhase.length > 0 && (
            <section className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                  Embudo
                </p>
                <h2 className="text-2xl font-semibold text-fm-on-surface mt-1">
                  Niños activos por fase de intake
                </h2>
              </div>
              <ul className="space-y-1.5 px-1">
                {data.childrenByIntakePhase.map((p) => {
                  const max =
                    data.childrenByIntakePhase[0]?.count ?? 1
                  const ratio = p.count / Math.max(1, max)
                  return (
                    <li key={p.phase} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-fm-on-surface">
                          {intakeLabel(p.phase)}
                        </span>
                        <span className="font-mono tabular-nums text-fm-on-surface-variant">
                          {p.count}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-fm-surface-container-high overflow-hidden">
                        <div
                          className="h-full bg-fm-primary/60 rounded-full"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <QuickLinks
            items={[
              { href: '/familias', label: 'Familias y niños', icon: 'groups' },
              { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
              { href: '/aprobaciones', label: 'Aprobaciones', icon: 'check_circle' },
              { href: '/admin/plantillas', label: 'Plantillas', icon: 'description' },
              { href: '/admin/tarifas', label: 'Tarifas', icon: 'sell' },
              { href: '/users', label: 'Staff', icon: 'badge' },
              { href: '/usuarios-portal', label: 'Portal familias', icon: 'family_restroom' },
            ]}
          />
        </main>
      </div>
    </div>
  )
}

function KpiBlock({
  label,
  value,
  subtitle,
  tone = 'neutral',
  href,
}: {
  label: string
  value: number | string
  subtitle?: string
  tone?: 'warn' | 'neutral'
  href?: string
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50/50'
      : 'border-fm-outline-variant/20 bg-fm-surface-container-lowest'
  const inner = (
    <div
      className={`rounded-3xl border p-5 transition-all ${toneClass} ${
        href ? 'hover:shadow-md cursor-pointer' : ''
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums text-fm-on-surface mt-2 leading-none">
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-fm-on-surface-variant mt-2">{subtitle}</p>
      )}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export function QuickLinks({
  items,
}: {
  items: { href: string; label: string; icon: string }[]
}) {
  return (
    <section className="space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
        Atajos
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-3 p-3 rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest hover:border-fm-primary/40 hover:bg-fm-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-fm-primary text-xl shrink-0">
              {it.icon}
            </span>
            <span className="text-sm font-medium text-fm-on-surface truncate">
              {it.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
