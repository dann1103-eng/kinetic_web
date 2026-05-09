import Link from 'next/link'
import { QuickLinks } from './MgmtDashboard'

interface Props {
  greeting: string
  todayCount: number
  weekCount: number
  pendingProgressReports: number
  pendingSessionReports: number
}

export function TerapistaDashboard({
  greeting,
  todayCount,
  weekCount,
  pendingProgressReports,
  pendingSessionReports,
}: Props) {
  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fm-on-surface">{greeting}</h1>
        <p className="text-sm text-fm-on-surface-variant">Tu panel del día</p>
      </div>

      {/* CTA principal: ir a /mi-dia */}
      <Link
        href="/mi-dia"
        className="block rounded-2xl border border-fm-primary/30 bg-fm-primary/5 p-5 hover:bg-fm-primary/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-fm-primary tabular-nums">
                {todayCount}
              </span>
              <span className="text-sm text-fm-on-surface-variant">
                citas programadas hoy
              </span>
            </div>
            <p className="text-xs text-fm-on-surface-variant mt-1">
              Iniciar sesiones, marcar inasistencias y dejar reportes desde Mi día.
            </p>
          </div>
          <div className="text-fm-primary text-sm font-semibold">
            Ir a Mi día →
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Citas próximos 7 días"
          value={weekCount}
          tone="info"
          href="/agenda"
        />
        <Stat
          label="Reportes de sesión por enviar"
          value={pendingSessionReports}
          tone={pendingSessionReports > 0 ? 'warn' : 'ok'}
          href="/mi-dia"
        />
        <Stat
          label="Informes de avances pendientes"
          value={pendingProgressReports}
          tone={pendingProgressReports > 0 ? 'warn' : 'ok'}
          href="/mi-dia"
        />
      </div>

      <QuickLinks
        items={[
          { href: '/mi-dia', label: 'Mi día', icon: 'today' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
          { href: '/familias', label: 'Familias', icon: 'groups' },
        ]}
      />
    </div>
  )
}

function Stat({
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
