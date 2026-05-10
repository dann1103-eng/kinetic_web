'use client'

import { useMemo } from 'react'
import {
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_SHORT_LABELS,
  SERVICE_TYPE_CHIP_CLASSES,
} from '@/types/db'
import type { ServiceType } from '@/types/db'
import type {
  AttendanceCell,
  AttendanceCellStatus,
} from '@/lib/domain/child-dashboard'

interface Props {
  /** 'YYYY-MM-01' del mes que se está mostrando. */
  periodMonth: string
  cells: AttendanceCell[]
  /** Si true, oculta el detalle de las sesiones bajo cada celda. */
  compact?: boolean
}

const PRIORITY: AttendanceCellStatus[] = [
  'no_show_pending',
  'late_cancel',
  'no_show_waived',
  'in_progress',
  'scheduled_today',
  'replacement_future',
  'scheduled_future',
  'replacement_done',
  'completed',
  'rescheduled',
  'empty',
]

/**
 * Surface por estado dominante de la celda. Usa tokens fm-* para mantenerse
 * alineado con DESIGN.md (un solo color primario, tertiary=positivo, error=
 * destructivo, secondary=warning sin emergencia). `ring-inset` reemplaza
 * `border` para dejar respirar a las pills coloreadas de servicio.
 */
const STATUS_SURFACE: Record<AttendanceCellStatus, string> = {
  completed: 'bg-fm-tertiary/10 ring-fm-tertiary/30',
  in_progress: 'bg-fm-primary/15 ring-fm-primary/40',
  scheduled_future: 'bg-fm-surface-container-lowest ring-fm-outline-variant/30',
  scheduled_today: 'bg-fm-primary/10 ring-fm-primary/30',
  replacement_future: 'bg-fm-tertiary/8 ring-fm-tertiary/25',
  replacement_done: 'bg-fm-tertiary/15 ring-fm-tertiary/40',
  no_show_pending: 'bg-fm-error/10 ring-fm-error/30',
  no_show_waived: 'bg-fm-secondary/15 ring-fm-secondary/40',
  late_cancel: 'bg-fm-secondary/20 ring-fm-secondary/50',
  rescheduled: 'bg-fm-surface-container ring-fm-outline-variant/20 opacity-60',
  empty: '',
}

const STATUS_LABEL: Record<AttendanceCellStatus, string> = {
  completed: 'Asistida',
  in_progress: 'En curso',
  scheduled_future: 'Programada',
  scheduled_today: 'Hoy',
  replacement_future: 'Reposición programada',
  replacement_done: 'Reposición asistida',
  no_show_pending: 'No asistió — falta reagendar',
  no_show_waived: 'No asistió (sin reposición)',
  late_cancel: 'Cancelación tardía',
  rescheduled: 'Movida',
  empty: 'Sin sesión',
}

const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function dominantStatus(appointments: AttendanceCell['appointments']): AttendanceCellStatus {
  if (appointments.length === 0) return 'empty'
  for (const s of PRIORITY) {
    if (appointments.some((a) => a.cellStatus === s)) return s
  }
  return 'empty'
}

export function AttendanceGrid({ periodMonth, cells, compact = false }: Props) {
  // Today en TZ local del browser. useMemo evita violar react-hooks/purity.
  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
  }, [])

  // Para alinear con la grilla 7-col necesito saber qué día de la semana cae el 1ro.
  const firstOfMonth = new Date(`${periodMonth}T12:00:00`) // mediodía evita off-by-one TZ
  const offset = firstOfMonth.getDay() // 0=Dom..6=Sáb
  const monthLabel = firstOfMonth.toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })

  const padding = Array.from({ length: offset }, (_, i) => ({ key: `pad-${i}` }))

  return (
    <section aria-label={`Calendario de ${monthLabel}`} className="space-y-3">
      <header>
        <p className="text-[10px] font-medium tracking-[0.18em] uppercase text-fm-on-surface-variant/70">
          Asistencia mensual
        </p>
        <h3 className="text-lg font-medium tracking-tight text-fm-on-surface mt-0.5 capitalize">
          {monthLabel}
        </h3>
      </header>

      <div
        className="grid grid-cols-7 gap-1.5 text-[11px] font-medium text-fm-on-surface-variant/70"
        aria-hidden="true"
      >
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center pb-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {padding.map((p) => (
          <div key={p.key} className="aspect-square" />
        ))}
        {cells.map((cell) => {
          const dom = dominantStatus(cell.appointments)
          const dayNum = parseInt(cell.date.slice(8, 10), 10)
          const cellHasContent = cell.appointments.length > 0
          const isToday = cell.date === todayIso
          const isPast = cell.date < todayIso

          const surface = cellHasContent
            ? `ring-1 ring-inset hover:ring-2 hover:-translate-y-[1px] hover:shadow-sm cursor-help transition-all duration-150 ${STATUS_SURFACE[dom]}`
            : isPast
              ? '' // pasados sin sesión: sin chrome
              : 'ring-1 ring-inset ring-fm-outline-variant/20'

          const todayRing = isToday ? 'ring-2 ring-fm-primary/70' : ''

          const dayNumClass = isToday
            ? 'text-[11px] font-semibold tabular-nums text-fm-primary'
            : cellHasContent
              ? 'text-[11px] font-medium tabular-nums text-fm-on-surface/80'
              : isPast
                ? 'text-[11px] font-normal tabular-nums text-fm-on-surface-variant/35'
                : 'text-[11px] font-normal tabular-nums text-fm-on-surface-variant/55'

          return (
            <div
              key={cell.date}
              className={`aspect-square rounded-lg p-1.5 flex flex-col relative ${surface} ${todayRing}`}
              title={
                cellHasContent
                  ? cell.appointments
                      .map(
                        (a) =>
                          `${
                            a.service_type
                              ? SERVICE_TYPE_LABELS[a.service_type as ServiceType] ?? a.service_type
                              : 'sesión'
                          } — ${STATUS_LABEL[a.cellStatus]}`,
                      )
                      .join('\n')
                  : `Día ${dayNum}: sin sesión`
              }
            >
              <span className={dayNumClass}>{dayNum}</span>
              {!compact && cellHasContent && (
                <div className="flex-1 flex flex-wrap gap-0.5 mt-1 content-start overflow-hidden">
                  {cell.appointments.slice(0, 3).map((a) => {
                    const svc = a.service_type as ServiceType | null
                    const shortLabel = svc
                      ? SERVICE_TYPE_SHORT_LABELS[svc] ?? svc.slice(0, 4)
                      : '—'
                    const chipClass = svc
                      ? SERVICE_TYPE_CHIP_CLASSES[svc]
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                    return (
                      <span
                        key={a.id}
                        className={`inline-flex items-center px-1 py-px text-[9px] font-semibold leading-none rounded border ${chipClass}`}
                      >
                        {shortLabel}
                      </span>
                    )
                  })}
                  {cell.appointments.length > 3 && (
                    <span className="inline-flex items-center px-1 py-px text-[9px] font-medium leading-none rounded border bg-white/60 text-fm-on-surface-variant border-fm-outline-variant/30">
                      +{cell.appointments.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Legend />
    </section>
  )
}

function Legend() {
  const items: { className: string; label: string }[] = [
    { className: 'bg-fm-tertiary/10 ring-1 ring-inset ring-fm-tertiary/30', label: 'Asistida' },
    { className: 'bg-fm-error/10 ring-1 ring-inset ring-fm-error/30', label: 'Falta reponer' },
    { className: 'bg-fm-secondary/15 ring-1 ring-inset ring-fm-secondary/40', label: 'Sin reposición' },
    { className: 'bg-fm-tertiary/15 ring-1 ring-inset ring-fm-tertiary/40', label: 'Reposición' },
    { className: 'bg-fm-surface-container-lowest ring-1 ring-inset ring-fm-outline-variant/30', label: 'Programada' },
  ]
  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[10px] text-fm-on-surface-variant pt-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded ${it.className}`} aria-hidden="true" />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  )
}
