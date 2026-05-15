'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

// ─── types ────────────────────────────────────────────────────────────────────

export interface CalendarAppt {
  id: string
  starts_at: string
  child_id: string
}

interface Props {
  appointments: CalendarAppt[]
  childNamesById: Record<string, string>
}

// ─── palette ─────────────────────────────────────────────────────────────────

// Fixed-position palette — child at index 0 always gets color 0, etc.
// Sorted by child_id to keep colors stable across renders.
const PALETTE = [
  '#1fa4da', // blue    (kp-primary)
  '#62ab36', // green   (kp-tertiary)
  '#f59e0b', // amber
  '#e5316e', // pink    (fm-error)
  '#a855f7', // purple
  '#f97316', // orange
]

// ─── helpers ─────────────────────────────────────────────────────────────────

const WEEK_HEADERS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// ─── component ───────────────────────────────────────────────────────────────

export function PortalCalendarWidget({ appointments, childNamesById }: Props) {
  const today = new Date()

  const [display, setDisplay] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )

  const year = display.getFullYear()
  const mon  = display.getMonth()

  // Stable child → color mapping (sorted by id for consistency)
  const childColors = useMemo<Record<string, string>>(() => {
    const ids = Array.from(new Set(appointments.map((a) => a.child_id))).sort()
    return Object.fromEntries(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]))
  }, [appointments])

  // day-key → ordered list of child_ids with appointments that day
  const dayMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of appointments) {
      const d   = new Date(a.starts_at)
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate())
      if (!m.has(key)) m.set(key, [])
      const arr = m.get(key)!
      if (!arr.includes(a.child_id)) arr.push(a.child_id)
    }
    return m
  }, [appointments])

  // Children present this displayed month (for legend)
  const monthPrefix = `${year}-${String(mon + 1).padStart(2, '0')}-`
  const legendIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [key, list] of dayMap) {
      if (key.startsWith(monthPrefix)) list.forEach((id) => ids.add(id))
    }
    return Array.from(ids).sort()
  }, [dayMap, monthPrefix])

  const totalDays = daysInMonth(year, mon)
  const startDow  = new Date(year, mon, 1).getDay() // 0 = Sunday
  const todayKey  = dateKey(today.getFullYear(), today.getMonth(), today.getDate())

  const monthLabel = display.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-[24px] p-4">

      {/* ─ Month navigation ─ */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setDisplay(new Date(year, mon - 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-fm-surface-container-high transition-colors"
          aria-label="Mes anterior"
        >
          <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">
            chevron_left
          </span>
        </button>

        <p className="text-[13px] font-semibold text-fm-on-surface capitalize">{monthLabel}</p>

        <button
          type="button"
          onClick={() => setDisplay(new Date(year, mon + 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-fm-surface-container-high transition-colors"
          aria-label="Mes siguiente"
        >
          <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">
            chevron_right
          </span>
        </button>
      </div>

      {/* ─ Weekday headers ─ */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_HEADERS.map((h) => (
          <div
            key={h}
            className="text-center text-[10px] font-semibold text-fm-on-surface-variant/60 py-0.5"
          >
            {h}
          </div>
        ))}
      </div>

      {/* ─ Day grid ─ */}
      <div className="grid grid-cols-7">
        {/* Leading empty cells */}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} className="h-9" />
        ))}

        {/* Day cells */}
        {Array.from({ length: totalDays }, (_, i) => {
          const day  = i + 1
          const key  = dateKey(year, mon, day)
          const ids  = dayMap.get(key) ?? []
          const solo = ids.length === 1 ? ids[0] : null
          const multi = ids.length > 1
          const isToday = key === todayKey

          return (
            <div key={day} className="flex flex-col items-center h-9 justify-start pt-0.5">
              {/* Bubble */}
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors',
                  solo
                    ? 'text-white'
                    : isToday
                    ? 'ring-2 ring-kp-primary text-kp-primary font-bold'
                    : 'text-fm-on-surface',
                )}
                style={solo ? { backgroundColor: childColors[solo] } : undefined}
              >
                {day}
              </div>

              {/* Multi-child dots */}
              {multi && (
                <div className="flex gap-[3px] mt-0.5">
                  {ids.slice(0, 4).map((id) => (
                    <div
                      key={id}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: childColors[id] }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─ Legend ─ */}
      {legendIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-fm-outline-variant/15 flex flex-wrap gap-x-4 gap-y-1.5">
          {legendIds.map((id) => (
            <div key={id} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: childColors[id] }}
              />
              <span className="text-[11px] text-fm-on-surface-variant">
                {childNamesById[id] ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
