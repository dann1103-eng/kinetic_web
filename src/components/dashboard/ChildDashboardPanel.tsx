import Link from 'next/link'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import type { ChildDashboardData, UpcomingAppointment } from '@/lib/domain/child-dashboard'
import { ChildDashboardCalendar } from './ChildDashboardCalendar'

interface Props {
  data: ChildDashboardData
  /** Para el link "Ver agenda completa". */
  familyId: string
  childId: string
  /** Nombre del niño/a — usado al exportar el calendario a PDF. */
  childName?: string
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function relativeFromNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  const absMin = Math.abs(diffMs / 60000)
  if (absMin < 60) return diffMs > 0 ? `en ${Math.round(absMin)} min` : `hace ${Math.round(absMin)} min`
  const absHr = absMin / 60
  if (absHr < 24) return diffMs > 0 ? `en ${Math.round(absHr)} h` : `hace ${Math.round(absHr)} h`
  const absDays = Math.round(absHr / 24)
  return diffMs > 0 ? `en ${absDays} d` : `hace ${absDays} d`
}

function serviceLabel(s: ServiceType | string | null): string {
  if (!s) return 'Sesión'
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? String(s)
}

export function ChildDashboardPanel({ data, familyId, childId, childName }: Props) {
  const { kpis, attendance, upcoming, last_completed, period_month } = data
  const hasPendingReplace = kpis.noShowPendingReplace > 0
  const next = upcoming[0] ?? null

  return (
    <div className="space-y-8">
      {/* Stats — KPIs como overview superior */}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Programadas" value={kpis.scheduled} />
        <Kpi label="Asistidas" value={kpis.completed} tone="ok" />
        <Kpi
          label="Pendientes de reponer"
          value={kpis.noShowPendingReplace}
          tone={hasPendingReplace ? 'error' : 'neutral'}
          href={hasPendingReplace ? '/aprobaciones' : undefined}
          hint={hasPendingReplace ? 'Reagendar' : undefined}
        />
        <Kpi label="Reposiciones" value={kpis.replacement} tone="ok-soft" />
      </dl>

      {/* Layout principal: calendario hero (8 cols) + right rail operativo (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
          <ChildDashboardCalendar
            attendance={attendance}
            upcoming={upcoming}
            periodMonth={period_month}
            childName={childName}
          />
        </section>

        <aside className="lg:col-span-4 space-y-4 min-w-0">
          <NextSessionCard next={next} />

          {upcoming.length > 0 && (
            <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4">
              <header className="flex items-center justify-between mb-3 gap-2">
                <p className="text-[10px] font-medium tracking-[0.16em] uppercase text-fm-on-surface-variant/70">
                  Próximas 14 días
                </p>
                <Link
                  href={`/agenda?child=${childId}`}
                  className="text-[11px] font-medium text-fm-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary focus-visible:ring-offset-2 rounded"
                >
                  Ver agenda →
                </Link>
              </header>
              <ul className="divide-y divide-fm-outline-variant/15 -my-1.5">
                {upcoming.slice(0, 5).map((a) => (
                  <li
                    key={a.id}
                    className="py-2 flex items-baseline justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-fm-on-surface text-[13px] flex items-center gap-1.5 flex-wrap leading-tight">
                        <span className="truncate">{serviceLabel(a.service_type)}</span>
                        {a.is_replacement && (
                          <span className="text-[9px] px-1.5 py-px bg-fm-tertiary/15 text-fm-tertiary rounded-full font-medium shrink-0">
                            Repo
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-fm-on-surface-variant/85 mt-0.5">
                        {formatDateTime(a.starts_at)}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-fm-on-surface-variant/85 tabular-nums shrink-0">
                      {relativeFromNow(a.starts_at)}
                    </span>
                  </li>
                ))}
              </ul>
              {upcoming.length > 5 && (
                <p className="text-[11px] text-fm-on-surface-variant/70 mt-2 pt-2 border-t border-fm-outline-variant/15">
                  +{upcoming.length - 5} más en agenda
                </p>
              )}
            </section>
          )}

          <LastSessionCard last={last_completed} />
        </aside>
      </div>

      {/* Footer info — info contextual mínima, alineada a la derecha */}
      <p className="text-[11px] text-fm-on-surface-variant/70 text-right">
        <span className="tabular-nums">{kpis.total}</span>{' '}
        {kpis.total === 1 ? 'sesión registrada' : 'sesiones registradas'} en{' '}
        <span className="capitalize">{monthLabel(period_month)}</span> ·{' '}
        <Link
          href={`/familias/${familyId}`}
          className="underline decoration-fm-outline-variant/40 underline-offset-2 hover:text-fm-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary rounded"
        >
          ficha de familia
        </Link>
      </p>
    </div>
  )
}

function monthLabel(periodMonth: string): string {
  return new Date(`${periodMonth}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

type KpiTone = 'ok' | 'ok-soft' | 'error' | 'neutral'

const KPI_TONE: Record<KpiTone, { surface: string; value: string; label: string }> = {
  ok: {
    surface: 'bg-fm-tertiary/10 ring-fm-tertiary/25',
    value: 'text-fm-tertiary',
    label: 'text-fm-tertiary/80',
  },
  'ok-soft': {
    surface: 'bg-fm-primary/8 ring-fm-primary/20',
    value: 'text-fm-primary',
    label: 'text-fm-primary/80',
  },
  error: {
    surface: 'bg-fm-error/10 ring-fm-error/30',
    value: 'text-fm-error',
    label: 'text-fm-error/85',
  },
  neutral: {
    surface: 'bg-fm-surface-container-lowest ring-fm-outline-variant/25',
    value: 'text-fm-on-surface',
    label: 'text-fm-on-surface-variant',
  },
}

function Kpi({
  label,
  value,
  tone = 'neutral',
  href,
  hint,
}: {
  label: string
  value: number
  tone?: KpiTone
  href?: string
  hint?: string
}) {
  const colors = KPI_TONE[tone]
  const isInteractive = !!href
  const inner = (
    <>
      <dd
        className={`text-[26px] leading-none font-semibold tabular-nums ${colors.value}`}
      >
        {value}
      </dd>
      <dt
        className={`text-[10px] font-semibold uppercase tracking-[0.14em] mt-2 ${colors.label}`}
      >
        {label}
      </dt>
      {hint && (
        <span
          className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${colors.value} group-hover:gap-1.5 transition-all`}
        >
          {hint}
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            arrow_forward
          </span>
        </span>
      )}
    </>
  )

  const baseClass = `group rounded-xl ring-1 ring-inset px-4 py-3.5 flex flex-col items-start ${colors.surface}`

  if (isInteractive && href) {
    return (
      <Link
        href={href}
        className={`${baseClass} hover:ring-2 hover:-translate-y-[1px] hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary focus-visible:ring-offset-2`}
        aria-label={`${label}: ${value}. ${hint ?? ''}`}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className={baseClass}>
      {inner}
    </div>
  )
}

function NextSessionCard({ next }: { next: UpcomingAppointment | null }) {
  return (
    <article className="rounded-2xl bg-fm-primary/8 ring-1 ring-inset ring-fm-primary/20 p-5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fm-primary/85 mb-1">
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          schedule
        </span>
        Próxima sesión
      </div>
      {!next ? (
        <p className="text-sm text-fm-on-surface-variant mt-2">Sin próximas sesiones agendadas.</p>
      ) : (
        <>
          <h3 className="text-lg font-semibold tracking-tight text-fm-on-surface mt-1">
            {serviceLabel(next.service_type)}
          </h3>
          <p className="text-sm text-fm-on-surface-variant mt-0.5">
            {formatDateTime(next.starts_at)}
          </p>
          <p className="text-xs font-medium text-fm-primary mt-2 tabular-nums">
            {relativeFromNow(next.starts_at)}
          </p>
        </>
      )}
    </article>
  )
}

function LastSessionCard({ last }: { last: UpcomingAppointment | null }) {
  return (
    <article className="rounded-2xl bg-fm-surface-container-lowest ring-1 ring-inset ring-fm-outline-variant/20 p-5">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-fm-on-surface-variant/70 mb-1">
        Última sesión completada
      </div>
      {!last ? (
        <p className="text-sm text-fm-on-surface-variant mt-2">
          Sin sesiones completadas todavía.
        </p>
      ) : (
        <>
          <h3 className="text-base font-medium tracking-tight text-fm-on-surface mt-1">
            {serviceLabel(last.service_type)}
          </h3>
          <p className="text-sm text-fm-on-surface-variant mt-0.5">
            {formatDateTime(last.starts_at)}
          </p>
          <p className="text-xs text-fm-on-surface-variant/75 mt-2 tabular-nums">
            {relativeFromNow(last.starts_at)}
          </p>
        </>
      )}
    </article>
  )
}
