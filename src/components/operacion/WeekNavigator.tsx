'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  /** "YYYY-MM-DD" del lunes de la semana visible. */
  weekStartParam: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Suma `days` al param manteniendo todo en UTC para evitar cruces de zona horaria. */
function shiftWeekParam(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Lunes de la semana actual en zona horaria del cliente. */
function todayMondayParam(): string {
  const t = new Date()
  const day = t.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(t)
  monday.setDate(monday.getDate() + diff)
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

export function WeekNavigator({ weekStartParam }: Props) {
  const pathname = usePathname()
  const prevWeek = shiftWeekParam(weekStartParam, -7)
  const nextWeek = shiftWeekParam(weekStartParam, 7)
  const todayParam = todayMondayParam()

  // Display: parseamos como UTC y formateamos con timeZone:'UTC' para evitar shifts.
  const [y, m, d] = weekStartParam.split('-').map(Number)
  const startDate = new Date(Date.UTC(y, m - 1, d, 12))
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 6)
  const monthSame = startDate.getUTCMonth() === endDate.getUTCMonth()
  const startStr = startDate.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: monthSame ? undefined : 'short',
    timeZone: 'UTC',
  })
  const endStr = endDate.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-fm-on-surface">
        {startStr} – {endStr}
      </h2>
      <Link
        href={`${pathname}?week=${todayParam}`}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface transition-colors"
      >
        Hoy
      </Link>
      <div className="flex items-center gap-0.5">
        <Link
          href={`${pathname}?week=${prevWeek}`}
          aria-label="Semana anterior"
          className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </Link>
        <Link
          href={`${pathname}?week=${nextWeek}`}
          aria-label="Semana siguiente"
          className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </Link>
      </div>
    </div>
  )
}
