'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { KIND_COLORS, KIND_COLORS_DARK } from '@/lib/domain/calendar'
import type { CalendarEventKind } from '@/lib/domain/calendar'
import { ClientRequirementSheet } from './ClientRequirementSheet'
import type { Phase } from '@/types/db'

const locales = { es }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
})

type SerialEvent = {
  id: string
  kind: CalendarEventKind
  title: string
  start: string
  end: string
  allDay: boolean
  phaseLabel: string | null
  phase: Phase | null
  requirementId: string | null
  reviewStartedAt: string | null
  notes: string | null
  deadline: string | null
}

type CalEvent = {
  id: string
  kind: CalendarEventKind
  title: string
  start: Date
  end: Date
  allDay: boolean
  phaseLabel: string | null
  phase: Phase | null
  requirementId: string | null
  reviewStartedAt: string | null
  notes: string | null
  deadline: string | null
}

interface Props {
  events: SerialEvent[]
  defaultDate: string
  clientId: string
  currentUserId: string
}

type ViewType = 'month' | 'week' | 'day'

function formatDeadline(d: string): string {
  try {
    const date = new Date(d + 'T00:00:00')
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es })
  } catch {
    return d
  }
}

// Chip color per phase label
function phaseBadgeClass(label: string | null): string {
  if (!label) return 'bg-fm-outline-variant/20 text-fm-on-surface-variant'
  if (label.includes('proceso') || label.toLowerCase().includes('dise')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (label.includes('Revisión')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (label.includes('Aprobado')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (label.includes('Publicado')) return 'bg-fm-primary/10 text-fm-primary'
  if (label.includes('publicar')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
  return 'bg-fm-outline-variant/20 text-fm-on-surface-variant'
}

export function PortalCalendarioClient({ events, defaultDate, clientId, currentUserId }: Props) {
  const [view, setView] = useState<ViewType>('month')
  const [date, setDate] = useState(() => {
    const parsed = parseISO(defaultDate)
    return isValid(parsed) ? parsed : new Date()
  })
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [sheetReq, setSheetReq] = useState<CalEvent | null>(null)

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const calEvents = useMemo<CalEvent[]>(() => {
    const result: CalEvent[] = []
    for (const e of events) {
      const start = parseISO(e.start)
      const end = parseISO(e.end)
      if (!isValid(start) || !isValid(end)) continue
      result.push({
        id: e.id,
        kind: e.kind,
        title: e.title,
        start,
        end,
        allDay: e.allDay,
        phaseLabel: e.phaseLabel,
        phase: e.phase,
        requirementId: e.requirementId,
        reviewStartedAt: e.reviewStartedAt,
        notes: e.notes,
        deadline: e.deadline,
      })
    }
    return result
  }, [events])

  const eventStyleGetter = (event: CalEvent) => {
    const color = (isDark ? KIND_COLORS_DARK : KIND_COLORS)[event.kind] ?? '#595c5e'
    return {
      style: {
        backgroundColor: event.allDay ? 'transparent' : color,
        color: event.allDay ? color : '#fff',
        border: event.allDay ? `1.5px solid ${color}` : 'none',
        borderRadius: 4,
        fontSize: 12,
        cursor: 'pointer',
      },
    }
  }

  const handleSelectEvent = useCallback((event: CalEvent) => {
    // Si el requerimiento está en revisión cliente, abrir el sheet con tabs
    // (revisión + chat) en lugar del popup estático.
    if (event.phase === 'revision_cliente' && event.requirementId) {
      setSheetReq(event)
      return
    }
    setSelectedEvent(event)
  }, [])

  return (
    <div className="h-full calendar-wrapper">
      <Calendar
        localizer={localizer}
        events={calEvents}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        titleAccessor="title"
        style={{ height: '100%' }}
        view={view}
        onView={(v) => setView(v as ViewType)}
        date={date}
        onNavigate={setDate}
        culture="es"
        selectable={false}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={handleSelectEvent}
        views={['month', 'week', 'day']}
        messages={{
          today: 'Hoy',
          previous: 'Anterior',
          next: 'Siguiente',
          month: 'Mes',
          week: 'Semana',
          day: 'Día',
          noEventsInRange: 'Sin eventos en este período.',
        }}
      />

      {/* Event detail popup */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Card */}
          <div
            className="relative bg-fm-surface-container rounded-2xl shadow-2xl border border-fm-outline-variant/30 p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="absolute top-3 right-3 p-1 rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container-high transition-colors"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Title */}
            <h3 className="text-base font-semibold text-fm-on-surface pr-8 leading-snug mb-3">
              {selectedEvent.title}
            </h3>

            {/* Phase badge */}
            {selectedEvent.phaseLabel && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mb-3 ${phaseBadgeClass(selectedEvent.phaseLabel)}`}
              >
                <span className="material-symbols-outlined text-[13px]">radio_button_checked</span>
                {selectedEvent.phaseLabel}
              </span>
            )}

            {/* Deadline */}
            {selectedEvent.deadline && (
              <div className="flex items-center gap-2 text-sm text-fm-on-surface-variant mb-2">
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">event</span>
                <span>Entrega: <span className="text-fm-on-surface font-medium">{formatDeadline(selectedEvent.deadline)}</span></span>
              </div>
            )}

            {/* Notes */}
            {selectedEvent.notes && (
              <p className="text-sm text-fm-on-surface-variant mt-3 pt-3 border-t border-fm-outline-variant/20 leading-relaxed">
                {selectedEvent.notes}
              </p>
            )}
          </div>
        </div>
      )}

      {sheetReq && sheetReq.requirementId && (
        <ClientRequirementSheet
          open
          onClose={() => setSheetReq(null)}
          requirementId={sheetReq.requirementId}
          requirementTitle={sheetReq.title}
          clientId={clientId}
          currentUserId={currentUserId}
          reviewStartedAt={sheetReq.reviewStartedAt}
        />
      )}
    </div>
  )
}
