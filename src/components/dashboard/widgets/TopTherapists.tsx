import type { TopTherapistRow } from '@/lib/domain/dashboard-widgets'

interface Props {
  rows: TopTherapistRow[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function TopTherapists({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            Capacidad
          </p>
          <h2 className="text-2xl font-semibold text-fm-on-surface mt-1">
            Terapistas más cargadas
          </h2>
        </div>
        <p className="text-sm text-fm-on-surface-variant">
          Sin actividad registrada este mes.
        </p>
      </section>
    )
  }

  const maxSessions = Math.max(...rows.map((r) => r.sessionsCompleted), 1)

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Actividad
        </p>
        <h2 className="text-2xl font-semibold text-fm-on-surface mt-1">
          Top terapistas
        </h2>
      </div>

      <ol className="space-y-3">
        {rows.map((r, idx) => {
          const ratio = r.sessionsCompleted / maxSessions
          return (
            <li
              key={r.therapistId}
              className="flex items-center gap-4 group"
            >
              <span className="text-[11px] font-bold tabular-nums text-fm-on-surface-variant w-4">
                {idx + 1}
              </span>
              <div
                className="w-9 h-9 rounded-full bg-fm-primary/10 text-fm-primary flex items-center justify-center text-xs font-bold shrink-0"
                aria-hidden="true"
              >
                {getInitials(r.fullName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fm-on-surface truncate">
                  {r.fullName}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-fm-surface-container-high overflow-hidden">
                    <div
                      className="h-full bg-fm-primary rounded-full"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-fm-on-surface-variant tabular-nums shrink-0">
                    {r.sessionsCompleted} ses
                  </span>
                </div>
              </div>
              {r.reportsApproved > 0 && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full tabular-nums shrink-0">
                  {r.reportsApproved} ✓
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
