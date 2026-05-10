import Link from 'next/link'
import {
  INTAKE_PHASE_LABELS,
  type IntakePhase,
} from '@/types/db'
import type { ChildReportOverview } from '@/lib/domain/dashboard-widgets'

interface Props {
  rows: ChildReportOverview[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function progressStatusChip(status: string | null): {
  label: string
  className: string
} {
  if (!status) {
    return {
      label: 'Sin informe',
      className: 'bg-fm-surface-container text-fm-on-surface-variant',
    }
  }
  switch (status) {
    case 'draft':
      return {
        label: 'Borrador',
        className: 'bg-amber-100 text-amber-900',
      }
    case 'submitted':
      return {
        label: 'Esperando aprobación',
        className: 'bg-blue-100 text-blue-900',
      }
    case 'approved':
    case 'sent_to_family':
      return {
        label: 'Aprobado',
        className: 'bg-emerald-100 text-emerald-900',
      }
    case 'rejected':
      return {
        label: 'Rechazado',
        className: 'bg-rose-100 text-rose-900',
      }
    default:
      return {
        label: status,
        className: 'bg-fm-surface-container text-fm-on-surface-variant',
      }
  }
}

function attendanceChip(rate: number | null, total: number): {
  label: string
  className: string
} {
  if (rate === null || total === 0) {
    return {
      label: '— sin citas',
      className: 'bg-fm-surface-container text-fm-on-surface-variant',
    }
  }
  const pct = Math.round(rate * 100)
  if (pct >= 90) {
    return {
      label: `${pct}% asistencia`,
      className: 'bg-emerald-100 text-emerald-900',
    }
  }
  if (pct >= 70) {
    return {
      label: `${pct}% asistencia`,
      className: 'bg-amber-100 text-amber-900',
    }
  }
  return {
    label: `${pct}% asistencia`,
    className: 'bg-rose-100 text-rose-900',
  }
}

export function ChildReportsOverview({ rows }: Props) {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            Expedientes activos
          </p>
          <h2 className="text-2xl font-semibold text-fm-on-surface mt-1">
            Reportes por niño
            <span className="ml-2 text-base font-medium text-fm-on-surface-variant tabular-nums">
              {rows.length}
            </span>
          </h2>
        </div>
        <Link
          href="/familias"
          className="text-xs font-semibold text-fm-primary hover:underline"
        >
          Ver todos →
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 px-8 py-12 text-center">
          <p className="text-sm text-fm-on-surface-variant">
            No hay niños activos para mostrar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest divide-y divide-fm-outline-variant/15">
          {rows.map((c) => {
            const progress = progressStatusChip(c.lastProgressReportStatus)
            const attendance = attendanceChip(
              c.attendanceRate,
              c.monthlyAppointmentsCount,
            )
            return (
              <Link
                key={c.childId}
                href={`/familias/${c.familyId}/children/${c.childId}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-fm-surface-container-low/40 transition-colors group"
              >
                <div
                  className="w-10 h-10 rounded-full bg-fm-primary/10 text-fm-primary flex items-center justify-center text-xs font-bold shrink-0"
                  aria-hidden="true"
                >
                  {getInitials(c.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fm-on-surface truncate group-hover:text-fm-primary transition-colors">
                    {c.fullName}
                  </p>
                  <p className="text-xs text-fm-on-surface-variant truncate mt-0.5">
                    {INTAKE_PHASE_LABELS[c.intakePhase as IntakePhase] ??
                      c.intakePhase}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${progress.className}`}
                  >
                    {progress.label}
                  </span>
                  {c.sessionReportsPending > 0 && (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 tabular-nums">
                      {c.sessionReportsPending} pend
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${attendance.className}`}
                  >
                    {attendance.label}
                  </span>
                </div>
                <span
                  className="material-symbols-outlined text-fm-on-surface-variant group-hover:text-fm-primary shrink-0 transition-colors"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
