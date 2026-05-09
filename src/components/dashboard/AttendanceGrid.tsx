'use client'

import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import type {
  AttendanceCell,
  AttendanceCellStatus,
} from '@/lib/domain/child-dashboard'

interface Props {
  /** 'YYYY-MM-01' del mes que se está mostrando. */
  periodMonth: string
  cells: AttendanceCell[]
  /** Si true, muestra el detalle de las sesiones bajo cada celda. */
  compact?: boolean
}

/**
 * Mapeo del status de cada appointment del día al chip color.
 * Si una celda tiene varios appointments, se prioriza el peor estado
 * (no_show_pending > late_cancel > no_show_waived > scheduled_today >
 * in_progress > scheduled_future > replacement_done > completed > rescheduled).
 */
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

const STATUS_COLOR: Record<AttendanceCellStatus, string> = {
  completed: 'bg-emerald-200 text-emerald-900 border-emerald-300',
  in_progress: 'bg-blue-300 text-blue-900 border-blue-400',
  scheduled_future: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  scheduled_today: 'bg-blue-100 text-blue-800 border-blue-300',
  replacement_future: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  replacement_done: 'bg-emerald-200 text-emerald-900 border-emerald-400 ring-1 ring-emerald-500',
  no_show_pending: 'bg-red-200 text-red-900 border-red-300',
  no_show_waived: 'bg-amber-200 text-amber-900 border-amber-300',
  late_cancel: 'bg-orange-200 text-orange-900 border-orange-300',
  rescheduled: 'bg-zinc-200 text-zinc-500 border-zinc-300 line-through',
  empty: 'bg-transparent text-fm-on-surface-variant border-fm-outline-variant/15',
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

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function dominantStatus(appointments: AttendanceCell['appointments']): AttendanceCellStatus {
  if (appointments.length === 0) return 'empty'
  for (const s of PRIORITY) {
    if (appointments.some((a) => a.cellStatus === s)) return s
  }
  return 'empty'
}

export function AttendanceGrid({ periodMonth, cells, compact = false }: Props) {
  // Para alinear con la grilla 7-col necesito saber qué día de la semana cae el 1ro.
  const firstOfMonth = new Date(`${periodMonth}T12:00:00`) // mediodía evita off-by-one TZ
  const offset = firstOfMonth.getDay() // 0=Dom..6=Sáb
  const monthLabel = firstOfMonth.toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })

  // Padding antes del día 1 + cells reales
  const padding = Array.from({ length: offset }, (_, i) => ({ key: `pad-${i}` }))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-fm-on-surface capitalize">
          {monthLabel}
        </h3>
        <Legend />
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-fm-on-surface-variant mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {padding.map((p) => (
          <div key={p.key} className="aspect-square" />
        ))}
        {cells.map((cell) => {
          const dom = dominantStatus(cell.appointments)
          const dayNum = parseInt(cell.date.slice(8, 10), 10)
          const cellHasContent = cell.appointments.length > 0
          return (
            <div
              key={cell.date}
              className={`aspect-square rounded-md border p-1 flex flex-col text-xs relative group ${
                STATUS_COLOR[dom]
              } ${cellHasContent ? 'cursor-help' : ''}`}
              title={
                cellHasContent
                  ? cell.appointments
                      .map(
                        (a) =>
                          `${(a.service_type
                            ? SERVICE_TYPE_LABELS[a.service_type as ServiceType] ?? a.service_type
                            : 'sesión')} — ${STATUS_LABEL[a.cellStatus]}`,
                      )
                      .join('\n')
                  : `Día ${dayNum}: sin sesión`
              }
            >
              <span className="text-[10px] font-semibold opacity-70">{dayNum}</span>
              {!compact && cellHasContent && (
                <div className="flex-1 flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                  {cell.appointments.slice(0, 2).map((a) => (
                    <div
                      key={a.id}
                      className="text-[9px] leading-tight truncate font-medium"
                    >
                      {a.service_type
                        ? (SERVICE_TYPE_LABELS[a.service_type as ServiceType] ?? a.service_type).slice(0, 8)
                        : '—'}
                    </div>
                  ))}
                  {cell.appointments.length > 2 && (
                    <div className="text-[9px] opacity-70">
                      +{cell.appointments.length - 2}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  const items: { status: AttendanceCellStatus; label: string }[] = [
    { status: 'completed', label: 'Asistida' },
    { status: 'no_show_pending', label: 'Falta reponer' },
    { status: 'no_show_waived', label: 'Sin reposición' },
    { status: 'replacement_done', label: 'Reposición' },
    { status: 'scheduled_future', label: 'Programada' },
  ]
  return (
    <div className="hidden md:flex items-center gap-2 text-[10px]">
      {items.map((it) => (
        <div key={it.status} className="flex items-center gap-1">
          <span className={`w-3 h-3 rounded border ${STATUS_COLOR[it.status]}`} />
          <span className="text-fm-on-surface-variant">{it.label}</span>
        </div>
      ))}
    </div>
  )
}
