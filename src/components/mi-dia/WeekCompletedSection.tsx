'use client'

import { useMemo } from 'react'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType, SessionReportStatus } from '@/types/db'

const TZ = 'America/El_Salvador'

export interface WeekCompletedItem {
  appointmentId: string
  sessionId: string | null
  childName: string
  serviceType: string | null
  startsAt: string
  reportStatus: SessionReportStatus | null
}

interface Props {
  items: WeekCompletedItem[]
  onReportClick: (item: WeekCompletedItem) => void
}

function serviceLabel(s: string | null): string {
  if (!s) return 'Sesión'
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? s
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function dayHeading(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

const REPORT_BADGE: Record<
  SessionReportStatus,
  { label: string; cls: string }
> = {
  draft: { label: 'Borrador', cls: 'bg-amber-100 text-amber-900' },
  rejected: { label: 'Rechazado', cls: 'bg-rose-100 text-rose-900' },
  submitted: { label: 'Enviado a revisión', cls: 'bg-sky-100 text-sky-900' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-900' },
  sent_to_family: { label: 'Enviado a familia', cls: 'bg-emerald-100 text-emerald-900' },
}

/** Estados donde todavía falta acción de la terapista sobre el reporte. */
const NEEDS_ACTION = new Set<SessionReportStatus | 'none'>(['none', 'draft', 'rejected'])

export function WeekCompletedSection({ items, onReportClick }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, WeekCompletedItem[]>()
    for (const it of items) {
      const k = dayKey(it.startsAt)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const missingReports = items.filter(
    (it) => NEEDS_ACTION.has(it.reportStatus ?? 'none'),
  ).length

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-fm-on-surface">Terapias completadas esta semana</h2>
        <span className="text-sm text-fm-on-surface-variant">
          {items.length} {items.length === 1 ? 'terapia' : 'terapias'}
        </span>
      </div>

      {missingReports > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Tenés <strong>{missingReports}</strong>{' '}
          {missingReports === 1 ? 'reporte pendiente' : 'reportes pendientes'} de esta semana.
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-fm-outline-variant/30 px-4 py-8 text-center text-sm text-fm-on-surface-variant">
          Todavía no hay terapias completadas esta semana.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, dayItems]) => (
            <div key={key}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-fm-on-surface-variant mb-2 capitalize">
                {dayHeading(dayItems[0].startsAt)}
              </h3>
              <div className="space-y-2">
                {dayItems.map((it) => {
                  const status = it.reportStatus
                  const badge = status ? REPORT_BADGE[status] : null
                  const needsAction = NEEDS_ACTION.has(status ?? 'none')
                  return (
                    <div
                      key={it.appointmentId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low/40 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono tabular-nums text-sm text-fm-on-surface-variant">
                          {timeLabel(it.startsAt)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-fm-on-surface truncate">
                            {it.childName}
                          </p>
                          <p className="text-xs text-fm-on-surface-variant truncate">
                            {serviceLabel(it.serviceType)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            badge ? badge.cls : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {badge ? badge.label : 'Sin reporte'}
                        </span>
                        {needsAction && (
                          <button
                            type="button"
                            onClick={() => onReportClick(it)}
                            className="text-xs font-semibold text-fm-primary hover:underline"
                          >
                            {status === 'draft' || status === 'rejected'
                              ? 'Continuar reporte'
                              : 'Subir reporte'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
