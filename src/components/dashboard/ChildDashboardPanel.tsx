import Link from 'next/link'
import { AttendanceGrid } from './AttendanceGrid'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import type { ChildDashboardData, UpcomingAppointment } from '@/lib/domain/child-dashboard'

interface Props {
  data: ChildDashboardData
  /** Para el link "Ver agenda completa". */
  familyId: string
  childId: string
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

export function ChildDashboardPanel({ data, familyId, childId }: Props) {
  const { kpis, attendance, upcoming, last_completed, period_month } = data
  const hasPendingReplace = kpis.noShowPendingReplace > 0
  const next = upcoming[0] ?? null

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Programadas del mes" value={kpis.scheduled} tone="info" />
        <KpiCard label="Asistidas" value={kpis.completed} tone="ok" />
        <KpiCard
          label="Pendientes de reponer"
          value={kpis.noShowPendingReplace}
          tone={hasPendingReplace ? 'error' : 'neutral'}
        />
        <KpiCard label="Reposiciones del mes" value={kpis.replacement} tone="info" />
      </div>

      {hasPendingReplace && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-700 text-lg">warning</span>
          <div>
            <p className="font-semibold">
              {kpis.noShowPendingReplace === 1
                ? 'Hay 1 sesión pendiente de reponer este mes.'
                : `Hay ${kpis.noShowPendingReplace} sesiones pendientes de reponer este mes.`}
            </p>
            <p className="text-xs mt-0.5">
              La directora puede reagendarlas desde{' '}
              <Link href="/aprobaciones" className="underline font-medium">
                /aprobaciones
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* Próxima + última */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NextSessionCard next={next} />
        <LastSessionCard last={last_completed} />
      </div>

      {/* Grilla calendario del mes */}
      <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4">
        <AttendanceGrid periodMonth={period_month} cells={attendance} />
      </section>

      {/* Próximas 14 días */}
      {upcoming.length > 0 && (
        <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-fm-on-surface">
              Próximas sesiones (14 días)
            </h3>
            <Link
              href={`/agenda?child=${childId}`}
              className="text-xs text-fm-primary hover:underline"
            >
              Ver agenda completa
            </Link>
          </div>
          <ul className="divide-y divide-fm-outline-variant/15">
            {upcoming.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium text-fm-on-surface">
                    {serviceLabel(a.service_type)}
                    {a.is_replacement && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                        Reposición
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-fm-on-surface-variant">
                    {formatDateTime(a.starts_at)} · {relativeFromNow(a.starts_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer info */}
      <p className="text-[11px] text-fm-on-surface-variant text-center">
        Total de sesiones registradas en {monthLabel(period_month)}: <b>{kpis.total}</b> · familia{' '}
        <Link href={`/familias/${familyId}`} className="underline">ver familia</Link>
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

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'info' | 'error' | 'neutral'
}) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    neutral: 'bg-fm-surface-container-low border-fm-outline-variant/20 text-fm-on-surface',
  }[tone]
  return (
    <div className={`rounded-xl border p-3 ${colors}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}

function NextSessionCard({ next }: { next: UpcomingAppointment | null }) {
  return (
    <div className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4">
      <div className="text-[10px] uppercase tracking-wider text-fm-on-surface-variant mb-1">
        Próxima sesión
      </div>
      {!next ? (
        <p className="text-sm text-fm-on-surface-variant">Sin próximas sesiones.</p>
      ) : (
        <>
          <div className="text-base font-semibold text-fm-on-surface">
            {serviceLabel(next.service_type)}
          </div>
          <div className="text-sm text-fm-on-surface-variant">
            {formatDateTime(next.starts_at)}
          </div>
          <div className="text-xs text-fm-primary mt-0.5">{relativeFromNow(next.starts_at)}</div>
        </>
      )}
    </div>
  )
}

function LastSessionCard({ last }: { last: UpcomingAppointment | null }) {
  return (
    <div className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4">
      <div className="text-[10px] uppercase tracking-wider text-fm-on-surface-variant mb-1">
        Última sesión completada
      </div>
      {!last ? (
        <p className="text-sm text-fm-on-surface-variant">Sin sesiones completadas todavía.</p>
      ) : (
        <>
          <div className="text-base font-semibold text-fm-on-surface">
            {serviceLabel(last.service_type)}
          </div>
          <div className="text-sm text-fm-on-surface-variant">
            {formatDateTime(last.starts_at)}
          </div>
          <div className="text-xs text-fm-on-surface-variant mt-0.5">
            {relativeFromNow(last.starts_at)}
          </div>
        </>
      )}
    </div>
  )
}
