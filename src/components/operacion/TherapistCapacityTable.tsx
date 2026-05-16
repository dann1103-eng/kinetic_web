'use client'

import Link from 'next/link'
import {
  occupancyToneClasses,
  formatHoursFraction,
  type WeeklyOccupancy,
} from '@/lib/domain/therapist-capacity'

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface Props {
  rows: WeeklyOccupancy[]
  weekStartIso: string  // YYYY-MM-DD del lunes
}

export function TherapistCapacityTable({ rows, weekStartIso }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
        <p className="text-sm text-fm-on-surface-variant">
          No hay terapistas registrados.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-fm-outline-variant/20 bg-fm-surface-container-low/50">
            <th className="text-left px-4 py-3 font-semibold text-fm-on-surface-variant text-xs uppercase tracking-wider">
              Terapista
            </th>
            {DAY_LABELS.map((d) => (
              <th
                key={d}
                className="text-center px-2 py-3 font-semibold text-fm-on-surface-variant text-xs uppercase tracking-wider"
              >
                {d}
              </th>
            ))}
            <th className="text-right px-4 py-3 font-semibold text-fm-on-surface-variant text-xs uppercase tracking-wider">
              Total
            </th>
            <th className="text-right px-4 py-3 font-semibold text-fm-on-surface-variant text-xs uppercase tracking-wider">
              Ocupación
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const overallTone = occupancyToneClasses(
              row.occupancyPct,
              row.totalScheduledMinutes,
            )
            return (
              <tr
                key={row.therapistId}
                className="border-b border-fm-outline-variant/10 last:border-0 hover:bg-fm-surface-container-low/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/agenda?therapistId=${row.therapistId}&date=${weekStartIso}`}
                    className="font-semibold text-fm-on-surface hover:text-fm-primary"
                  >
                    {row.therapistName}
                  </Link>
                  {row.overContract && row.maxHoursPerWeek != null && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[12px]">warning</span>
                      Excede {row.maxHoursPerWeek}h/sem
                    </div>
                  )}
                </td>
                {row.byDay.map((d) => {
                  const tone = occupancyToneClasses(
                    d.scheduledMinutes > 0
                      ? Math.round((d.workedMinutes / d.scheduledMinutes) * 100)
                      : 0,
                    d.scheduledMinutes,
                  )
                  return (
                    <td key={d.dayIndex} className="px-2 py-3 text-center">
                      <span
                        className={`inline-block tabular-nums text-[11px] font-semibold px-2 py-1 rounded-md ${tone.bg} ${tone.text}`}
                      >
                        {d.workedMinutes === 0 && d.scheduledMinutes === 0
                          ? '—'
                          : formatHoursFraction(d.workedMinutes, d.scheduledMinutes)}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-fm-on-surface">
                  {formatHoursFraction(row.totalWorkedMinutes, row.totalScheduledMinutes)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`tabular-nums text-sm font-bold px-3 py-1 rounded-full ${overallTone.bg} ${overallTone.text}`}
                  >
                    {row.totalScheduledMinutes === 0 ? '—' : `${row.occupancyPct}%`}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
