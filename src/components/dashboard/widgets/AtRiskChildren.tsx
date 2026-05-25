import Link from 'next/link'
import {
  AT_RISK_ALERT_LABELS,
  type AtRiskChild,
} from '@/lib/domain/dashboard-widgets'

interface Props {
  rows: AtRiskChild[]
}

export function AtRiskChildren({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-3xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/30 p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
          Alertas
        </p>
        <h2 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100 mt-1">
          Sin alertas activas
        </h2>
        <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80 mt-2 max-w-prose">
          Todos los niños activos tienen contacto de emergencia, plan, ciclo del
          mes y sin inasistencias acumuladas.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/30 p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-900 dark:text-amber-100">
            Alertas
          </p>
          <h2 className="text-xl font-semibold text-amber-950 dark:text-amber-50 mt-1">
            Niños en riesgo
            <span className="ml-2 text-sm font-medium text-amber-800/70 dark:text-amber-200/70 tabular-nums">
              {rows.length}
            </span>
          </h2>
        </div>
        <span
          className="material-symbols-outlined text-amber-700 dark:text-amber-300"
          aria-hidden="true"
        >
          warning
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((c) => (
          <li
            key={c.childId}
            className="rounded-2xl bg-fm-surface-container-lowest border border-amber-200/40 dark:border-amber-800/30 px-4 py-3"
          >
            <Link
              href={`/familias/${c.familyId}/children/${c.childId}`}
              className="flex items-start justify-between gap-3 group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fm-on-surface truncate group-hover:text-fm-primary transition-colors">
                  {c.fullName}
                </p>
                <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {c.alerts.map((alert) => (
                    <li
                      key={alert}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                    >
                      {AT_RISK_ALERT_LABELS[alert]}
                    </li>
                  ))}
                </ul>
              </div>
              <span
                className="material-symbols-outlined text-amber-700 dark:text-amber-300 group-hover:text-fm-primary shrink-0 transition-colors"
                aria-hidden="true"
              >
                arrow_outward
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
