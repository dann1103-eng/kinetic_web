'use client'

/**
 * KineticMonthGrid — vista mensual custom (NO usa react-big-calendar) que
 * muestra el desglose de eventos del mes con pills coloreadas por día.
 *
 * Pensado para el child dashboard (donde queremos ver TODAS las sesiones
 * del mes en su día correspondiente, no una lista colapsada con "+N more"
 * como hace RBC en su month view).
 *
 * El grid es 7×N: empieza en lunes, llena el resto del mes, y termina con
 * los días del mes siguiente que completan la última semana. Cada celda
 * muestra hasta 3 pills (más un "+N" badge si hay más).
 */

import { useMemo } from 'react'
import { paletteFor, type KineticEventDatum } from './KineticCalendar'
import {
  SERVICE_TYPE_SHORT_LABELS,
  type ServiceType,
} from '@/types/db'

interface Props<T extends KineticEventDatum> {
  events: T[]
  /** Fecha del mes a mostrar (cualquier día del mes). */
  date: Date
  /** Click en una celda con eventos. */
  onSelectDay?: (date: Date, events: T[]) => void
  /** Click en un evento individual. */
  onSelectEvent?: (event: T) => void
  /** Máximo de pills por celda antes de mostrar +N. Default 3. */
  maxPillsPerCell?: number
}

const DAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTimeShort(d: Date): string {
  return d
    .toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase()
}

function shortServiceLabel(colorKey?: string | null): string | null {
  if (!colorKey) return null
  return SERVICE_TYPE_SHORT_LABELS[colorKey as ServiceType] ?? null
}

interface Cell {
  date: Date
  iso: string
  inMonth: boolean
}

function buildMonthGrid(displayDate: Date): Cell[] {
  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // En JS getDay(): 0=Dom..6=Sáb. Queremos lunes como inicio.
  // offset = días entre el lunes anterior y el día 1.
  const dow = firstOfMonth.getDay()
  const offset = dow === 0 ? 6 : dow - 1
  const start = new Date(year, month, 1 - offset)

  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      date: d,
      iso: dayKey(d),
      inMonth: d.getMonth() === month,
    })
  }
  // Trim trailing weeks que solo tengan días del mes siguiente.
  while (cells.length > 28) {
    const lastWeek = cells.slice(-7)
    const allOff = lastWeek.every((c) => !c.inMonth)
    if (!allOff) break
    cells.splice(-7, 7)
  }
  return cells
}

export function KineticMonthGrid<T extends KineticEventDatum>({
  events,
  date,
  onSelectDay,
  onSelectEvent,
  maxPillsPerCell = 3,
}: Props<T>) {
  const cells = useMemo(() => buildMonthGrid(date), [date])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, T[]>()
    for (const ev of events) {
      const key = dayKey(ev.start)
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    // Sort por start time ascendente
    for (const list of map.values()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime())
    }
    return map
  }, [events])

  const todayIso = useMemo(() => dayKey(new Date()), [])

  return (
    <div>
      {/* Day labels header */}
      <div
        role="row"
        aria-hidden="true"
        className="grid grid-cols-7 gap-1.5 text-[11px] font-medium text-fm-on-surface-variant/70 lowercase pb-2"
      >
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Grid de celdas */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const list = eventsByDay.get(cell.iso) ?? []
          const isToday = cell.iso === todayIso
          const isPast = cell.iso < todayIso
          const cellHasContent = list.length > 0

          // Surface por estado del día
          const surface = !cell.inMonth
            ? 'opacity-40'
            : cellHasContent
              ? 'ring-1 ring-inset ring-fm-outline-variant/15 bg-fm-surface-container-lowest hover:ring-fm-outline-variant/40 hover:shadow-sm transition-all duration-150'
              : isPast
                ? ''
                : 'ring-1 ring-inset ring-fm-outline-variant/10'

          const todayRing = isToday ? 'ring-2 ring-fm-primary/60' : ''

          const dayNumClass = isToday
            ? 'text-[12px] font-semibold tabular-nums text-fm-primary'
            : !cell.inMonth
              ? 'text-[12px] font-normal tabular-nums text-fm-on-surface-variant/40'
              : cellHasContent
                ? 'text-[12px] font-medium tabular-nums text-fm-on-surface'
                : isPast
                  ? 'text-[12px] font-normal tabular-nums text-fm-on-surface-variant/30'
                  : 'text-[12px] font-normal tabular-nums text-fm-on-surface-variant/55'

          const visiblePills = list.slice(0, maxPillsPerCell)
          const overflow = list.length - visiblePills.length

          const handleCellClick = () => {
            if (cellHasContent && onSelectDay) onSelectDay(cell.date, list)
          }

          return (
            <div
              key={cell.iso}
              className={`min-h-[110px] rounded-xl p-1.5 flex flex-col gap-1 ${surface} ${todayRing} ${
                cellHasContent && onSelectDay ? 'cursor-pointer' : ''
              }`}
              onClick={handleCellClick}
              role={cellHasContent && onSelectDay ? 'button' : undefined}
              tabIndex={cellHasContent && onSelectDay ? 0 : undefined}
            >
              <div className="flex items-center justify-between px-0.5">
                <span className={dayNumClass}>{cell.date.getDate()}</span>
                {overflow > 0 && (
                  <span className="text-[9px] font-medium text-fm-on-surface-variant/70 tabular-nums">
                    +{overflow}
                  </span>
                )}
              </div>

              {visiblePills.length > 0 && (
                <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                  {visiblePills.map((ev) => {
                    const palette = paletteFor(ev.colorKey)
                    const short = shortServiceLabel(ev.colorKey) ?? ev.title
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (onSelectEvent) onSelectEvent(ev)
                          else if (onSelectDay) onSelectDay(cell.date, list)
                        }}
                        className={`w-full text-left rounded-md px-1.5 py-0.5 ring-1 ring-inset transition-shadow hover:shadow-sm overflow-hidden ${palette.bg} ${palette.ring} ${palette.text}`}
                      >
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-[9px] font-medium tabular-nums opacity-75 shrink-0">
                            {formatTimeShort(ev.start)}
                          </span>
                          <span className="text-[10px] font-semibold leading-tight truncate">
                            {short}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
