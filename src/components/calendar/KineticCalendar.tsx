'use client'

/**
 * KineticCalendar — wrapper unificado sobre react-big-calendar con el skin
 * inspirado en calendar.me. Bundles:
 *  - localizer es-419 (date-fns)
 *  - toolbar custom con switcher Mes/Semana/Día y nav prev/today/next
 *  - event renderer con pills pastel + tabular nums
 *  - day-cell renderer del week view (cards con número grande)
 *
 * Pensado para reemplazar las 4 instancias de <Calendar /> del proyecto:
 *   /agenda, /calendario, portal padres, child dashboard.
 *
 * El consumer pasa events tipados con `colorKey` (string) y la wrapper
 * deriva las clases de fondo/anillo desde KINETIC_EVENT_PALETTES.
 */

import { useMemo, useState, useCallback } from 'react'
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type EventProps,
  type Event as RBCEvent,
} from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = { es }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
})

/** Paleta de colores de evento. Cada `colorKey` mapea a un set bg + ring + text. */
export const KINETIC_EVENT_PALETTES: Record<
  string,
  { bg: string; ring: string; text: string; accent: string }
> = {
  // Base por servicio terapéutico (same hues as SERVICE_TYPE_CHIP_CLASSES en db.ts)
  lenguaje: { bg: 'bg-sky-100/85', ring: 'ring-sky-300/70', text: 'text-sky-950', accent: 'bg-sky-400' },
  motricidad_gruesa: { bg: 'bg-orange-100/85', ring: 'ring-orange-300/70', text: 'text-orange-950', accent: 'bg-orange-400' },
  motricidad_fina: { bg: 'bg-amber-100/85', ring: 'ring-amber-300/70', text: 'text-amber-950', accent: 'bg-amber-400' },
  sensorial: { bg: 'bg-fuchsia-100/85', ring: 'ring-fuchsia-300/70', text: 'text-fuchsia-950', accent: 'bg-fuchsia-400' },
  psicologica: { bg: 'bg-violet-100/85', ring: 'ring-violet-300/70', text: 'text-violet-950', accent: 'bg-violet-400' },
  ocupacional: { bg: 'bg-teal-100/85', ring: 'ring-teal-300/70', text: 'text-teal-950', accent: 'bg-teal-400' },
  fisica: { bg: 'bg-emerald-100/85', ring: 'ring-emerald-300/70', text: 'text-emerald-950', accent: 'bg-emerald-400' },
  lectoescritura: { bg: 'bg-indigo-100/85', ring: 'ring-indigo-300/70', text: 'text-indigo-950', accent: 'bg-indigo-400' },
  funciones_ejecutivas: { bg: 'bg-cyan-100/85', ring: 'ring-cyan-300/70', text: 'text-cyan-950', accent: 'bg-cyan-400' },
  conductual: { bg: 'bg-rose-100/85', ring: 'ring-rose-300/70', text: 'text-rose-950', accent: 'bg-rose-400' },
  blue_kids: { bg: 'bg-blue-100/85', ring: 'ring-blue-300/70', text: 'text-blue-950', accent: 'bg-blue-400' },
  alim_deglu: { bg: 'bg-lime-100/85', ring: 'ring-lime-300/70', text: 'text-lime-950', accent: 'bg-lime-400' },
  destreza_manual_pre_escritura: { bg: 'bg-yellow-100/85', ring: 'ring-yellow-300/70', text: 'text-yellow-950', accent: 'bg-yellow-400' },
  // Terapias especialidad (Excel 2026)
  ils_escucha: { bg: 'bg-purple-100/85', ring: 'ring-purple-300/70', text: 'text-purple-950', accent: 'bg-purple-400' },
  refuerzo_academico: { bg: 'bg-pink-100/85', ring: 'ring-pink-300/70', text: 'text-pink-950', accent: 'bg-pink-400' },
  concentracion_atencion: { bg: 'bg-blue-100/85', ring: 'ring-blue-300/70', text: 'text-blue-950', accent: 'bg-blue-400' },
  comunicacion_regulacion: { bg: 'bg-rose-100/85', ring: 'ring-rose-300/70', text: 'text-rose-950', accent: 'bg-rose-400' },
  estimulacion_juego: { bg: 'bg-emerald-100/85', ring: 'ring-emerald-300/70', text: 'text-emerald-950', accent: 'bg-emerald-400' },
  // Tipos de evento no-terapia
  evaluacion: { bg: 'bg-fm-secondary/15', ring: 'ring-fm-secondary/40', text: 'text-fm-on-surface', accent: 'bg-fm-secondary' },
  entrevista_antecedentes: { bg: 'bg-fm-tertiary/10', ring: 'ring-fm-tertiary/30', text: 'text-fm-on-surface', accent: 'bg-fm-tertiary' },
  entrevista_conocimiento: { bg: 'bg-fm-tertiary/15', ring: 'ring-fm-tertiary/40', text: 'text-fm-on-surface', accent: 'bg-fm-tertiary' },
  reunion_padres: { bg: 'bg-fm-tertiary/15', ring: 'ring-fm-tertiary/40', text: 'text-fm-on-surface', accent: 'bg-fm-tertiary' },
  reunion_colegio: { bg: 'bg-fm-on-surface-variant/10', ring: 'ring-fm-on-surface-variant/30', text: 'text-fm-on-surface', accent: 'bg-fm-on-surface-variant' },
  entrega_avances: { bg: 'bg-fm-primary/10', ring: 'ring-fm-primary/30', text: 'text-fm-on-surface', accent: 'bg-fm-primary' },
  programa_matutino: { bg: 'bg-fm-secondary/20', ring: 'ring-fm-secondary/50', text: 'text-fm-on-surface', accent: 'bg-fm-secondary' },
  otro: { bg: 'bg-fm-surface-container-high', ring: 'ring-fm-outline-variant/40', text: 'text-fm-on-surface', accent: 'bg-fm-on-surface-variant' },
  // Estados especiales
  no_show: { bg: 'bg-fm-error/10', ring: 'ring-fm-error/30', text: 'text-fm-error', accent: 'bg-fm-error' },
  late_cancel: { bg: 'bg-fm-error/8', ring: 'ring-fm-error/25', text: 'text-fm-error', accent: 'bg-fm-error' },
  rescheduled: { bg: 'bg-fm-surface-container', ring: 'ring-fm-outline-variant/30', text: 'text-fm-on-surface-variant line-through', accent: 'bg-fm-outline-variant' },
  replacement: { bg: 'bg-fm-tertiary/15', ring: 'ring-fm-tertiary/40', text: 'text-fm-on-surface', accent: 'bg-fm-tertiary' },
  // Default
  default: { bg: 'bg-fm-primary/10', ring: 'ring-fm-primary/30', text: 'text-fm-on-surface', accent: 'bg-fm-primary' },
}

export function paletteFor(key?: string | null) {
  if (!key) return KINETIC_EVENT_PALETTES.default
  return KINETIC_EVENT_PALETTES[key] ?? KINETIC_EVENT_PALETTES.default
}

/** Calcula la etiqueta del toolbar para una vista + fecha dadas. */
export function formatCalendarLabel(view: View, date: Date): string {
  if (view === 'month') {
    return date.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })
  }
  if (view === 'day') {
    return date.toLocaleDateString('es-SV', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  // week: "13 – 19 oct, 2026"
  const ws = startOfWeek(date, { weekStartsOn: 1 })
  const we = new Date(ws)
  we.setDate(we.getDate() + 6)
  const monthSame = ws.getMonth() === we.getMonth()
  const startStr = ws.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: monthSame ? undefined : 'short',
  })
  const endStr = we.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${startStr} – ${endStr}`
}

/** Helper para navegación: retorna la nueva fecha según la dirección. */
export function navigateCalendarDate(
  view: View,
  current: Date,
  action: 'PREV' | 'NEXT' | 'TODAY',
): Date {
  if (action === 'TODAY') return new Date()
  const next = new Date(current)
  const dir = action === 'PREV' ? -1 : 1
  if (view === 'month') next.setMonth(next.getMonth() + dir)
  else if (view === 'week') next.setDate(next.getDate() + 7 * dir)
  else next.setDate(next.getDate() + dir)
  return next
}

/** Forma esperada de cada evento. El consumer extiende libremente. */
export interface KineticEventDatum extends RBCEvent {
  id: string
  title: string
  start: Date
  end: Date
  /** Clave de color (servicio o tipo de evento). Determina el palette. */
  colorKey?: string | null
  /** Texto opcional debajo del título (ej. "Lucía R · Karina"). */
  subtitle?: string
  /** Marcadores opcionales — render como puntito a la izquierda. */
  pills?: Array<{ label: string; tone?: 'primary' | 'tertiary' | 'error' }>
  /**
   * Tag pequeño que se muestra como pill en la esquina del evento del calendario.
   * Útil para señalar "Reposición" o "Reagendada".
   */
  tag?: { label: string; tone?: 'replacement' | 'rescheduled' | 'absence' } | null
}

const TAG_TONE_CLASSES: Record<NonNullable<NonNullable<KineticEventDatum['tag']>['tone']>, string> = {
  replacement: 'bg-fm-tertiary text-white',
  rescheduled: 'bg-fm-on-surface-variant/70 text-white',
  absence:     'bg-fm-error text-white',
}

function formatTimeShort(d: Date): string {
  return d
    .toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase()
}

/** Event renderer — versión "block" para week/day (alta). */
function KineticEventBlock({ event }: EventProps<KineticEventDatum>) {
  const palette = paletteFor(event.colorKey)
  const timeRange = `${formatTimeShort(event.start)} – ${formatTimeShort(event.end)}`
  const tagTone = event.tag?.tone ?? 'replacement'
  return (
    <div
      className={`group relative h-full w-full rounded-[10px] ring-1 ring-inset px-2 py-1.5 overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${palette.bg} ${palette.ring} ${palette.text}`}
    >
      {event.tag && (
        <span
          className={`absolute top-1 right-1 text-[8px] leading-none uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full shadow-sm ${TAG_TONE_CLASSES[tagTone]}`}
          title={event.tag.label}
        >
          {event.tag.label}
        </span>
      )}
      <div className="text-[11px] font-semibold leading-tight line-clamp-2 pr-12">
        {event.title}
      </div>
      {event.subtitle && (
        <div className="text-[10px] opacity-80 leading-tight truncate mt-0.5">
          {event.subtitle}
        </div>
      )}
      <div className="text-[10px] opacity-70 tabular-nums mt-0.5">{timeRange}</div>
    </div>
  )
}

/** Event renderer — versión "strip" para month view (1 línea). */
function KineticEventStrip({ event }: EventProps<KineticEventDatum>) {
  const palette = paletteFor(event.colorKey)
  const tagTone = event.tag?.tone ?? 'replacement'
  return (
    <div
      className={`flex items-center gap-1.5 w-full px-1.5 py-0.5 rounded-md cursor-pointer ${palette.bg} ${palette.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${palette.accent}`} aria-hidden="true" />
      <span className="text-[10px] font-medium leading-tight truncate flex-1">
        {formatTimeShort(event.start)} · {event.title}
      </span>
      {event.tag && (
        <span
          className={`text-[8px] leading-none uppercase tracking-wider font-bold px-1 py-0.5 rounded-full shrink-0 ${TAG_TONE_CLASSES[tagTone]}`}
        >
          {event.tag.label}
        </span>
      )}
    </div>
  )
}

/** Day header del WEEK view — card grande tipo "deslizador" arriba del time grid. */
function KineticWeekDayHeader({ date, label: _label }: { date: Date; label: string }) {
  void _label
  const dayName = date
    .toLocaleDateString('es-SV', { weekday: 'short' })
    .replace('.', '')
    .toLowerCase()
  const dayNum = date.getDate()
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const isWeekend = date.getDay() === 0 || date.getDay() === 6

  return (
    <div
      className={`mx-1 my-1.5 rounded-2xl px-3 py-2.5 transition-all duration-200 flex items-center justify-center gap-2.5 ${
        isToday
          ? 'bg-fm-surface-container-lowest shadow-sm ring-1 ring-fm-outline-variant/30'
          : isWeekend
            ? 'bg-fm-surface-container/50'
            : 'bg-transparent'
      }`}
    >
      <span
        className={`text-[11px] font-medium lowercase tracking-wide ${
          isToday ? 'text-fm-on-surface' : 'text-fm-on-surface-variant/80'
        }`}
      >
        {dayName}
      </span>
      <span
        className={`text-[26px] font-semibold tabular-nums leading-none ${
          isToday ? 'text-fm-primary' : 'text-fm-on-surface'
        }`}
      >
        {dayNum}
      </span>
    </div>
  )
}

/** Day header del MONTH view — solo el nombre del día abreviado. */
function KineticMonthHeader({ date }: { date: Date; label: string }) {
  const dayName = date
    .toLocaleDateString('es-SV', { weekday: 'short' })
    .replace('.', '')
    .toLowerCase()
  return (
    <div className="text-[11px] font-medium text-fm-on-surface-variant lowercase">
      {dayName}
    </div>
  )
}

/** Toolbar custom — month/year + nav + view switcher. Reusable. */
export interface KineticToolbarProps {
  label: string
  view: View
  views: View[]
  onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY') => void
  onView: (view: View) => void
  rightSlot?: React.ReactNode
}

export function KineticToolbar({ label, view, views, onNavigate, onView, rightSlot }: KineticToolbarProps) {
  const VIEW_LABEL: Record<string, string> = {
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Lista',
  }
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-fm-on-surface capitalize">
          {label}
        </h2>
        <button
          type="button"
          onClick={() => onNavigate('TODAY')}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary"
        >
          Hoy
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onNavigate('PREV')}
            aria-label="Anterior"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('NEXT')}
            aria-label="Siguiente"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Vista del calendario"
          className="inline-flex items-center p-0.5 rounded-full bg-fm-surface-container"
        >
          {views.map((v) => {
            const active = v === view
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onView(v)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fm-primary ${
                  active
                    ? 'bg-fm-surface-container-lowest text-fm-on-surface shadow-sm'
                    : 'text-fm-on-surface-variant hover:text-fm-on-surface'
                }`}
              >
                {VIEW_LABEL[v] ?? v}
              </button>
            )
          })}
        </div>
        {rightSlot}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper principal
// ─────────────────────────────────────────────────────────────────────────────

interface KineticCalendarProps<T extends KineticEventDatum> {
  events: T[]
  defaultView?: View
  views?: View[]
  /** Modo controlado: vista actual. Si se provee, KineticCalendar no maneja vista internamente. */
  view?: View
  /** Modo controlado: fecha actual visible. */
  date?: Date
  onViewChange?: (view: View) => void
  onDateChange?: (date: Date) => void
  /** Hora mínima del time grid (week/day view). Default 7am. */
  minHour?: number
  /** Hora máxima del time grid. Default 7pm. */
  maxHour?: number
  step?: number
  timeslots?: number
  selectable?: boolean
  onSelectEvent?: (event: T) => void
  onSelectSlot?: (slot: { start: Date; end: Date }) => void
  dayPropGetter?: (date: Date) => { className?: string; style?: React.CSSProperties }
  /** Slot extra en el toolbar (ej. botón "+ Nueva cita"). */
  toolbarRightSlot?: React.ReactNode
  /** Si true, oculta el toolbar (consumer renderiza su propio header). */
  hideToolbar?: boolean
  /** Componentes custom para drag-and-drop wrappers etc. */
  components?: Record<string, unknown>
}

const DEFAULT_VIEWS: View[] = [Views.MONTH, Views.WEEK, Views.DAY]

export function KineticCalendar<T extends KineticEventDatum>({
  events,
  defaultView = Views.WEEK,
  views = DEFAULT_VIEWS,
  view: viewProp,
  date: dateProp,
  onViewChange,
  onDateChange,
  minHour = 7,
  maxHour = 19,
  step = 30,
  timeslots = 2,
  selectable = false,
  onSelectEvent,
  onSelectSlot,
  dayPropGetter,
  toolbarRightSlot,
  hideToolbar = false,
  components: extraComponents,
}: KineticCalendarProps<T>) {
  const [internalView, setInternalView] = useState<View>(defaultView)
  const [internalDate, setInternalDate] = useState<Date>(() => new Date())
  const view = viewProp ?? internalView
  const date = dateProp ?? internalDate
  const setView = useCallback(
    (v: View) => {
      if (onViewChange) onViewChange(v)
      else setInternalView(v)
    },
    [onViewChange],
  )
  const setDate = useCallback(
    (d: Date) => {
      if (onDateChange) onDateChange(d)
      else setInternalDate(d)
    },
    [onDateChange],
  )

  const min = useMemo(() => {
    const d = new Date(1970, 0, 1, minHour, 0, 0)
    return d
  }, [minHour])
  const max = useMemo(() => {
    const d = new Date(1970, 0, 1, maxHour, 0, 0)
    return d
  }, [maxHour])

  const handleNavigate = useCallback(
    (action: 'PREV' | 'NEXT' | 'TODAY') => {
      setDate(navigateCalendarDate(view, date, action))
    },
    [date, view, setDate],
  )

  const label = useMemo(() => formatCalendarLabel(view, date), [date, view])

  const calComponents = useMemo(
    () => ({
      event: KineticEventBlock,
      week: { header: KineticWeekDayHeader, event: KineticEventBlock },
      day: { header: KineticWeekDayHeader, event: KineticEventBlock },
      month: { header: KineticMonthHeader, event: KineticEventStrip },
      ...(extraComponents ?? {}),
    }),
    [extraComponents],
  )

  const eventStyleGetter = useCallback(() => {
    // El bg/ring lo maneja el componente. Solo dejamos un wrapper transparente.
    return { className: '', style: { background: 'transparent', border: 0, padding: 0 } }
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideToolbar && (
        <KineticToolbar
          label={label}
          view={view}
          views={views}
          onNavigate={handleNavigate}
          onView={setView}
          rightSlot={toolbarRightSlot}
        />
      )}
      <div className="flex-1 calendar-wrapper min-h-0">
        <Calendar<T>
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={views}
          step={step}
          timeslots={timeslots}
          min={min}
          max={max}
          selectable={selectable}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayPropGetter}
          culture="es"
          components={calComponents}
          messages={{
            today: 'Hoy',
            previous: 'Anterior',
            next: 'Siguiente',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            agenda: 'Lista',
            date: 'Fecha',
            time: 'Hora',
            event: 'Evento',
            noEventsInRange: 'Sin citas en este rango.',
            showMore: (n) => `+${n} más`,
          }}
        />
      </div>
    </div>
  )
}

export { Views as KineticViews } from 'react-big-calendar'
