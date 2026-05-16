'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  KineticCalendar,
  type KineticEventDatum,
} from '@/components/calendar/KineticCalendar'
import { Views } from 'react-big-calendar'
import {
  getTherapistCalendarWindow,
  type TherapistCalendarWindow,
  type ReplacementSuggestion,
} from '@/app/actions/absences'

interface Props {
  therapistId: string
  durationMinutes: number
  onSlotClick: (startsAtIso: string, endsAtIso: string) => void
  highlightSuggestions?: ReplacementSuggestion[]
  /** Si está set, se destaca con outline. Recibido como ISO string. */
  selectedStartIso?: string | null
}

/** Lunes 00:00 local de la semana que contiene `d`. */
function startOfWeekLocal(d: Date): Date {
  const day = d.getDay() // 0=dom, 1=lun, ..., 6=sáb
  const diff = day === 0 ? -6 : 1 - day // mover al lunes
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() + diff)
  return r
}

/** Domingo 23:59:59 local de la semana que contiene `d`. */
function endOfWeekLocal(d: Date): Date {
  const r = startOfWeekLocal(d)
  r.setDate(r.getDate() + 6)
  r.setHours(23, 59, 59, 999)
  return r
}

/** ISO → 'YYYY-MM-DDTHH:MM' formateado en TZ local. Usado para comparar slots. */
function isoToLocalKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface AvailabilityEvent extends KineticEventDatum {
  kind: 'appointment' | 'closure' | 'suggestion'
}

export function TherapistAvailabilityCalendar({
  therapistId,
  durationMinutes,
  onSlotClick,
  highlightSuggestions,
  selectedStartIso,
}: Props) {
  const [weekDate, setWeekDate] = useState<Date>(() => new Date())
  const [data, setData] = useState<TherapistCalendarWindow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carga cuando cambia el terapista o la semana visible
  useEffect(() => {
    if (!therapistId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const ws = startOfWeekLocal(weekDate)
    const we = endOfWeekLocal(weekDate)

    getTherapistCalendarWindow(therapistId, ws.toISOString(), we.toISOString())
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setError(res.error)
          setData(null)
        } else {
          setData(res.data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [therapistId, weekDate])

  const events: AvailabilityEvent[] = useMemo(() => {
    if (!data) return []
    const out: AvailabilityEvent[] = []

    // Citas existentes del terapista
    for (const a of data.appointments) {
      const childName = data.childNamesById[a.child_id] ?? 'Niño/a'
      const colorKey = a.event_type === 'terapia' && a.service_type
        ? a.service_type
        : a.event_type ?? 'default'
      out.push({
        id: a.id,
        title: childName,
        start: new Date(a.starts_at),
        end: new Date(a.ends_at),
        colorKey,
        kind: 'appointment',
      })
    }

    // Cierres institucionales que caen en la semana visible
    const ws = startOfWeekLocal(weekDate)
    const we = endOfWeekLocal(weekDate)
    for (const c of data.closures) {
      const [y, m, d] = c.date.split('-').map(Number)
      const closureDate = new Date(y, m - 1, d, 0, 0, 0, 0)
      // year_recurring → ajustar año al de la semana visible
      const candidate = c.year_recurring
        ? new Date(weekDate.getFullYear(), m - 1, d, 0, 0, 0, 0)
        : closureDate
      if (candidate < ws || candidate > we) continue

      out.push({
        id: `closure-${c.id}-${candidate.toISOString().slice(0, 10)}`,
        title: c.name ?? 'Cierre',
        start: new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), 8, 0),
        end: new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), 18, 0),
        colorKey: 'rescheduled',
        kind: 'closure',
      })
    }

    // Sugerencias destacadas (overlay)
    if (highlightSuggestions && highlightSuggestions.length > 0) {
      for (const s of highlightSuggestions) {
        const start = new Date(s.starts_at)
        if (start < ws || start > we) continue
        const isSelected = selectedStartIso && isoToLocalKey(selectedStartIso) === isoToLocalKey(s.starts_at)
        out.push({
          id: `suggestion-${s.starts_at}`,
          title: isSelected ? '✓ Slot elegido' : 'Slot sugerido',
          start,
          end: new Date(s.ends_at),
          colorKey: isSelected ? 'evaluacion' : 'replacement',
          kind: 'suggestion',
        })
      }
    }

    return out
  }, [data, weekDate, highlightSuggestions, selectedStartIso])

  function handleSelectSlot(slot: { start: Date; end: Date }) {
    const start = slot.start
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    onSlotClick(start.toISOString(), end.toISOString())
  }

  return (
    <div className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
          Agenda del terapista
        </span>
        <span className="text-[11px] text-fm-on-surface-variant">
          {loading ? 'Cargando…' : 'Click en un espacio vacío para elegir hora'}
        </span>
      </div>
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1 mb-2">
          {error}
        </p>
      )}
      <div className="h-[420px]">
        <KineticCalendar<AvailabilityEvent>
          events={events}
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY]}
          date={weekDate}
          onDateChange={setWeekDate}
          minHour={7}
          maxHour={19}
          step={15}
          timeslots={4}
          selectable
          onSelectSlot={handleSelectSlot}
        />
      </div>
    </div>
  )
}
