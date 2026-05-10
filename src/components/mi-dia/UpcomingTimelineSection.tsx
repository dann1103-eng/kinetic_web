'use client'

import { TimelineRow } from './TimelineRow'
import type { Appointment } from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

export interface UpcomingDay {
  dateISO: string
  weekday: string
  day: string
  month: string
  appointments: AppointmentWithChild[]
}

interface UpcomingTimelineSectionProps {
  days: UpcomingDay[]
  monthLabel: string
}

export function UpcomingTimelineSection({ days, monthLabel }: UpcomingTimelineSectionProps) {
  if (days.length === 0) return null

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between text-fm-on-surface-variant px-2">
        <h2 className="text-2xl font-semibold text-fm-on-surface">Próximos días</h2>
        <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
          <span className="material-symbols-outlined text-fm-outline" aria-hidden="true">
            chevron_left
          </span>
          <span className="text-fm-on-surface">{monthLabel}</span>
          <span className="material-symbols-outlined text-fm-outline" aria-hidden="true">
            chevron_right
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {days.map((d, i) => (
          <TimelineRow
            key={d.dateISO}
            weekday={d.weekday}
            day={d.day}
            month={d.month}
            appointments={d.appointments}
            colorIndex={i}
          />
        ))}
      </div>
    </section>
  )
}
