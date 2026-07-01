'use client'

/**
 * Calendario del child dashboard.
 *
 *  - VISTA MENSUAL → KineticMonthGrid (custom): muestra TODO el mes con
 *    pills coloreadas por servicio en cada día. No usa RBC porque queremos
 *    el desglose completo (no la lista colapsada con +N more).
 *  - VISTA SEMANAL/DIARIA → KineticCalendar (RBC con skin calendar.me).
 *
 * State lifted aquí: vista + fecha visible. La toolbar es compartida
 * (KineticToolbar) para que cambiar de vista preserve la fecha.
 *
 * Datos: combina `attendance` (mes en curso) + `upcoming` (próximos 14
 * días) en un único array de eventos.
 */

import { useMemo, useState } from 'react'
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/types/db'
import type {
  AttendanceCell,
  AttendanceCellStatus,
  UpcomingAppointment,
} from '@/lib/domain/child-dashboard'
import {
  KineticCalendar,
  KineticToolbar,
  formatCalendarLabel,
  navigateCalendarDate,
  type KineticEventDatum,
} from '@/components/calendar/KineticCalendar'
import { KineticMonthGrid } from '@/components/calendar/KineticMonthGrid'
import type { View } from 'react-big-calendar'

interface Props {
  attendance: AttendanceCell[]
  upcoming: UpcomingAppointment[]
  periodMonth: string
  /** Nombre del niño/a — usado como título al exportar el calendario a PDF. */
  childName?: string
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

const VIEWS: View[] = ['month', 'week', 'day']

export function ChildDashboardCalendar({ attendance, upcoming, periodMonth, childName }: Props) {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState<Date>(() => new Date(`${periodMonth}T12:00:00`))

  const events = useMemo<ChildEvent[]>(() => {
    const seen = new Set<string>()
    const result: ChildEvent[] = []

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

  const label = formatCalendarLabel(view, date)

  function handleExportPdf() {
    const ids = events.map((e) => e.id)
    if (ids.length === 0) {
      window.alert('No hay citas que exportar.')
      return
    }
    const params = new URLSearchParams()
    params.set('ids', ids.join(','))
    if (childName) params.set('child', childName)
    window.open(`/api/agenda/pdf?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <KineticToolbar
          label={label}
          view={view}
          views={VIEWS}
          onView={setView}
          onNavigate={(action) => setDate(navigateCalendarDate(view, date, action))}
        />
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={events.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-fm-primary/40 text-fm-primary hover:bg-fm-primary/5 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
          Exportar PDF
        </button>
      </div>

      {view === 'month' ? (
        // maxPillsPerCell alto: en el dashboard del niño queremos ver TODAS las
        // citas del día sin el colapso "+N" (requerimiento: sin límites de vista).
        <KineticMonthGrid<ChildEvent> events={events} date={date} maxPillsPerCell={99} />
      ) : (
        <KineticCalendar<ChildEvent>
          events={events}
          views={VIEWS}
          view={view}
          date={date}
          onViewChange={setView}
          onDateChange={setDate}
          minHour={7}
          maxHour={19}
          step={30}
          timeslots={2}
          selectable={false}
          hideToolbar
        />
      )}
    </div>
  )
}
