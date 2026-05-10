'use client'

/**
 * Calendario del child dashboard. Reemplaza al AttendanceGrid mensual con
 * KineticCalendar (estilo calendar.me) y permite alternar entre vista
 * mensual y semanal desde el toolbar interno.
 *
 * Datos: combina `attendance` (mes en curso) + `upcoming` (próximos 14
 * días) en un único array de eventos. Las celdas pasadas mantienen su
 * color por estado (no_show_pending → rojo, etc.); el resto colorea por
 * tipo de servicio.
 */

import { useMemo } from 'react'
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/types/db'
import type {
  AttendanceCell,
  AttendanceCellStatus,
  UpcomingAppointment,
} from '@/lib/domain/child-dashboard'
import { KineticCalendar, type KineticEventDatum } from '@/components/calendar/KineticCalendar'

interface Props {
  attendance: AttendanceCell[]
  upcoming: UpcomingAppointment[]
  periodMonth: string
}

interface ChildEvent extends KineticEventDatum {
  cellStatus?: AttendanceCellStatus
}

const STATUS_NOTE: Partial<Record<AttendanceCellStatus, string>> = {
  no_show_pending: 'No asistió · falta reponer',
  no_show_waived: 'No asistió',
  late_cancel: 'Cancelación tardía',
  rescheduled: 'Movida',
  replacement_done: 'Reposición asistida',
  replacement_future: 'Reposición programada',
  in_progress: 'En curso',
  completed: 'Asistida',
}

function colorKeyFor(
  serviceType: string | null | undefined,
  cellStatus: AttendanceCellStatus | undefined,
): string {
  // Estados que pisan el color del servicio (alta señal visual)
  if (cellStatus === 'no_show_pending') return 'no_show'
  if (cellStatus === 'late_cancel') return 'late_cancel'
  if (cellStatus === 'no_show_waived') return 'late_cancel'
  if (cellStatus === 'rescheduled') return 'rescheduled'
  if (cellStatus === 'replacement_done' || cellStatus === 'replacement_future') {
    return 'replacement'
  }
  return serviceType ?? 'default'
}

function serviceLabel(s: string | null | undefined): string {
  if (!s) return 'Sesión'
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? String(s)
}

export function ChildDashboardCalendar({ attendance, upcoming, periodMonth: _periodMonth }: Props) {
  void _periodMonth
  const events = useMemo<ChildEvent[]>(() => {
    const seen = new Set<string>()
    const result: ChildEvent[] = []

    // 1. Citas del mes (con su cellStatus para colorear estados especiales)
    for (const cell of attendance) {
      for (const a of cell.appointments) {
        if (seen.has(a.id)) continue
        seen.add(a.id)
        result.push({
          id: a.id,
          title: serviceLabel(a.service_type),
          subtitle: STATUS_NOTE[a.cellStatus],
          start: new Date(a.starts_at),
          end: new Date(a.ends_at),
          colorKey: colorKeyFor(a.service_type as string | null, a.cellStatus),
          cellStatus: a.cellStatus,
        })
      }
    }

    // 2. Próximas (cubre semanas que crucen el límite del mes)
    for (const a of upcoming) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      result.push({
        id: a.id,
        title: serviceLabel(a.service_type),
        subtitle: a.is_replacement ? 'Reposición' : undefined,
        start: new Date(a.starts_at),
        end: new Date(a.ends_at),
        colorKey: a.is_replacement
          ? 'replacement'
          : (a.service_type as string | null) ?? 'default',
      })
    }

    return result
  }, [attendance, upcoming])

  return (
    <KineticCalendar<ChildEvent>
      events={events}
      defaultView="month"
      views={['month', 'week', 'day']}
      minHour={7}
      maxHour={19}
      step={30}
      timeslots={2}
      selectable={false}
    />
  )
}
