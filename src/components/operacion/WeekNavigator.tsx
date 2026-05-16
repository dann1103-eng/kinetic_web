'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  weekStart: Date
  weekEnd: Date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function WeekNavigator({ weekStart, weekEnd }: Props) {
  const pathname = usePathname()
  const prevWeek = toDateParam(addDays(weekStart, -7))
  const nextWeek = toDateParam(addDays(weekStart, 7))
  const todayMonday = (() => {
    const today = new Date()
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    return toDateParam(addDays(today, diff))
  })()

  const monthSame = weekStart.getMonth() === weekEnd.getMonth()
  const startStr = weekStart.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: monthSame ? undefined : 'short',
  })
  const endStr = weekEnd.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-fm-on-surface">
        {startStr} – {endStr}
      </h2>
      <Link
        href={`${pathname}?week=${todayMonday}`}
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
