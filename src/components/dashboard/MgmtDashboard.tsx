import Link from 'next/link'
import type { MgmtDashboardData } from '@/lib/domain/global-dashboard'
import { INTAKE_PHASE_LABELS } from '@/types/db'
import type { IntakePhase } from '@/types/db'

interface Props {
  data: MgmtDashboardData
  greeting: string
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function intakeLabel(p: string): string {
  return INTAKE_PHASE_LABELS[p as IntakePhase] ?? p
}

export function MgmtDashboard({ data, greeting }: Props) {
  const totalPending =
    data.pendingCounts.progressReports +
    data.pendingCounts.sessionReports +
    data.pendingCounts.absences

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fm-on-surface">{greeting}</h1>
        <p className="text-sm text-fm-on-surface-variant capitalize">
          Resumen de {data.periodLabel}
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Sesiones del mes"
          value={data.monthlyAppointments.total}
          subtitle={`${data.monthlyAppointments.completed} asistidas · ${data.monthlyAppointments.no_show} no-show`}
          tone="info"
        />
        <Kpi
          label="Niños activos"
          value={data.activeChildren}
          tone="ok"
        />
        <Kpi
          label="Ingresos del mes"
          value={fmtMoney(data.monthlyRevenueUsd)}
          tone="ok"
        />
        <Kpi
          label="Pendientes de aprobación"
          value={totalPending}
          tone={totalPending > 0 ? 'warn' : 'neutral'}
          href={totalPending > 0 ? '/aprobaciones' : undefined}
        />
      </div>

      {/* Pendings detalle */}
      {totalPending > 0 && (
        <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fm-on-surface">Bandeja de aprobación</h2>
            <Link
              href="/aprobaciones"
              className="text-xs text-fm-primary hover:underline"
            >
              Ir a /aprobaciones →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PendingMini
              label="Informes de avances"
              count={data.pendingCounts.progressReports}
            />
            <PendingMini
              label="Reportes de sesión"
              count={data.pendingCounts.sessionReports}
            />
            <PendingMini
              label="Inasistencias por reagendar"
              count={data.pendingCounts.absences}
            />
          </div>
        </section>
      )}

      {/* Funnel de intake */}
      {data.childrenByIntakePhase.length > 0 && (
        <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fm-on-surface">
              Niños activos por fase de intake
            </h2>
            <Link href="/familias" className="text-xs text-fm-primary hover:underline">
              Ver familias →
            </Link>
          </div>
          <ul className="space-y-1.5">
            {data.childrenByIntakePhase.map((p) => (
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
        </section>
      )}

      <QuickLinks
        items={[
          { href: '/familias', label: 'Familias y niños', icon: 'groups' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
          { href: '/aprobaciones', label: 'Aprobaciones', icon: 'check_circle' },
          { href: '/admin/plantillas', label: 'Plantillas de informes', icon: 'description' },
          { href: '/users', label: 'Usuarios staff', icon: 'badge' },
          { href: '/usuarios-portal', label: 'Usuarios portal', icon: 'family_restroom' },
        ]}
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  subtitle,
  tone,
  href,
}: {
  label: string
  value: number | string
  subtitle?: string
  tone: 'ok' | 'info' | 'warn' | 'neutral'
  href?: string
}) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    neutral: 'bg-fm-surface-container-low border-fm-outline-variant/20 text-fm-on-surface',
  }[tone]
  const inner = (
    <div className={`rounded-xl border p-4 transition-all ${colors} ${href ? 'hover:shadow-md cursor-pointer' : ''}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
      {subtitle && <div className="text-[11px] mt-1 opacity-75">{subtitle}</div>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function PendingMini({ label, count }: { label: string; count: number }) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        count > 0
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-fm-surface-container-low border-fm-outline-variant/20 text-fm-on-surface-variant'
      }`}
    >
      <div className="text-xl font-bold tabular-nums">{count}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  )
}

export function QuickLinks({
  items,
}: {
  items: { href: string; label: string; icon: string }[]
}) {
  return (
    <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
      <h2 className="text-sm font-semibold text-fm-on-surface mb-3">Atajos</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex flex-col items-center gap-1 p-3 rounded-lg border border-fm-outline-variant/20 hover:border-fm-primary/40 hover:bg-fm-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-fm-primary text-2xl">
              {it.icon}
            </span>
            <span className="text-[11px] text-center text-fm-on-surface">{it.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
