'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { SERVICE_TYPE_LABELS, EVENT_TYPE_LABELS } from '@/types/db'

// ─── types ────────────────────────────────────────────────────────────────────

export interface CalendarAppt {
  id: string
  starts_at: string
  ends_at: string | null
  child_id: string
  service_type: string | null
  event_type: string | null
  therapist_name?: string | null
}

interface Props {
  appointments: CalendarAppt[]
  childNamesById: Record<string, string>
}

// ─── constants ────────────────────────────────────────────────────────────────

// Palette sorted by position — stable across renders
const PALETTE = [
  '#1fa4da', // blue    (kp-primary)
  '#62ab36', // green   (kp-tertiary)
  '#f59e0b', // amber
  '#e5316e', // pink    (fm-error)
  '#a855f7', // purple
  '#f97316', // orange
]

const WEEK_HEADERS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

// ─── helpers ─────────────────────────────────────────────────────────────────

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function apptLabel(appt: CalendarAppt): string {
  if (appt.event_type === 'terapia' && appt.service_type) {
    return (SERVICE_TYPE_LABELS as Record<string, string>)[appt.service_type] ?? appt.service_type
  }
  if (appt.event_type) {
    return (EVENT_TYPE_LABELS as Record<string, string>)[appt.event_type] ?? appt.event_type
  }
  return 'Cita'
}

// ─── component ───────────────────────────────────────────────────────────────

export function PortalCalendarWidget({ appointments, childNamesById }: Props) {
  const today = new Date()

  const [display, setDisplay]   = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const year = display.getFullYear()
  const mon  = display.getMonth()

  // Stable child → color (sorted by id)
  const childColors = useMemo<Record<string, string>>(() => {
    const ids = Array.from(new Set(appointments.map((a) => a.child_id))).sort()
    return Object.fromEntries(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]))
  }, [appointments])

  // day-key → CalendarAppt[] (preserving insertion order = start time order)
  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarAppt[]>()
    for (const a of appointments) {
      const d   = new Date(a.starts_at)
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate())
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(a)
    }
    return m
  }, [appointments])

  // Children present in displayed month (for legend)
  const monthPrefix = `${year}-${String(mon + 1).padStart(2, '0')}-`
  const legendIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [key, list] of dayMap) {
      if (key.startsWith(monthPrefix)) list.forEach((a) => ids.add(a.child_id))
    }
    return Array.from(ids).sort()
  }, [dayMap, monthPrefix])

  const totalDays = daysInMonth(year, mon)
  const startDow  = new Date(year, mon, 1).getDay()
  const todayKey  = dateKey(today.getFullYear(), today.getMonth(), today.getDate())

  const monthLabel = display.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })

  // Selected day appointments
  const selectedAppts = selectedKey ? (dayMap.get(selectedKey) ?? []) : []
  const selectedDateLabel = selectedKey
    ? (() => {
        const [y, m, d] = selectedKey.split('-').map(Number)
        return new Date(y, m - 1, d).toLocaleDateString('es-SV', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      })()
    : ''

  function handleDayClick(key: string) {
    if (!dayMap.has(key)) return          // no appointments → ignore
    setSelectedKey((prev) => (prev === key ? null : key)) // toggle
  }

  function nav(delta: number) {
    setSelectedKey(null)
    setDisplay(new Date(year, mon + delta, 1))
  }

  return (
    <div className="bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-[24px] p-4">

      {/* ─ Month navigation ─ */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-fm-surface-container-high transition-colors"
          aria-label="Mes anterior"
        >
          <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">chevron_left</span>
        </button>
        <p className="text-[13px] font-semibold text-fm-on-surface capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={() => nav(1)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-fm-surface-container-high transition-colors"
          aria-label="Mes siguiente"
        >
          <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">chevron_right</span>
        </button>
      </div>

      {/* ─ Weekday headers ─ */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_HEADERS.map((h) => (
          <div key={h} className="text-center text-[10px] font-semibold text-fm-on-surface-variant/60 py-0.5">
            {h}
          </div>
        ))}
      </div>

      {/* ─ Day grid ─ */}
      <div className="grid grid-cols-7">
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} className="h-9" />
        ))}

        {Array.from({ length: totalDays }, (_, i) => {
          const day      = i + 1
          const key      = dateKey(year, mon, day)
          const appts    = dayMap.get(key) ?? []
          const childIds = Array.from(new Set(appts.map((a) => a.child_id)))
          const solo     = childIds.length === 1 ? childIds[0] : null
          const multi    = childIds.length > 1
          const isToday  = key === todayKey
          const hasAppts = appts.length > 0
          const isSelected = key === selectedKey

          return (
            <div
              key={day}
              className={cn(
                'flex flex-col items-center h-9 justify-start pt-0.5',
                hasAppts && 'cursor-pointer',
              )}
              onClick={() => handleDayClick(key)}
            >
              {/* Day bubble */}
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all',
                  solo
                    ? 'text-white'
                    : isToday
                    ? 'ring-2 ring-kp-primary text-kp-primary font-bold'
                    : multi
                    ? 'text-fm-on-surface'
                    : 'text-fm-on-surface-variant',
                )}
                style={{
                  ...(solo ? { backgroundColor: childColors[solo] } : undefined),
                  ...(isSelected && hasAppts
                    ? { outline: '2px solid #1fa4da', outlineOffset: '2px' }
                    : undefined),
                }}
              >
                {day}
              </div>

              {/* Multi-child dots */}
              {multi && (
                <div className="flex gap-[3px] mt-0.5">
                  {childIds.slice(0, 4).map((id) => (
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

      {/* ─ Selected day detail ─ */}
      {selectedAppts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-fm-outline-variant/15 space-y-2">
          <p className="text-[11px] font-semibold text-fm-on-surface-variant uppercase tracking-wider capitalize">
            {selectedDateLabel}
          </p>

          {selectedAppts.map((appt) => {
            const color = childColors[appt.child_id]
            const name  = childNamesById[appt.child_id] ?? '—'
            const label = apptLabel(appt)
            const time  = `${formatTime(appt.starts_at)}${appt.ends_at ? ` — ${formatTime(appt.ends_at)}` : ''}`

            return (
              <div
                key={appt.id}
                className="rounded-xl bg-fm-surface-container-low p-3 space-y-1"
              >
                <p className="text-[11px] text-fm-on-surface-variant">{time}</p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <p className="text-[13px] font-semibold text-fm-on-surface leading-tight">
                    {name}
                    {label && (
                      <span className="font-normal text-fm-on-surface-variant"> — {label}</span>
                    )}
                  </p>
                </div>
                {appt.therapist_name && (
                  <div className="pl-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-fm-surface-container text-fm-on-surface-variant px-2.5 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[12px]">person</span>
                      con {appt.therapist_name}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
