'use client'

import { useState, useMemo, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import {
  EVENT_TYPE_LABELS,
  type Appointment,
  type Child,
  type EventType,
  type InstitutionalClosure,
} from '@/types/db'
import { EVENT_TYPE_COLORS, findClosureAffecting } from '@/lib/domain/appointment'
import { AppointmentForm } from '@/components/agenda/AppointmentForm'

const locales = { es }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
})

// Working hours grid (7am – 7pm)
const workDayMin = new Date(1970, 0, 1, 7, 0, 0)
const workDayMax = new Date(1970, 0, 1, 19, 0, 0)

type ChildLite = Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'treatment_status'>
type TherapistLite = { id: string; full_name: string; role: string; avatar_url: string | null }

interface AgendaPageClientProps {
  currentUserRole: string
  currentUserId: string
  initialAppointments: Appointment[]
  childrenList: ChildLite[]
  therapists: TherapistLite[]
  closures: InstitutionalClosure[]
}

interface CalendarBlock {
  id: string
  title: string
  start: Date
  end: Date
  appointment: Appointment
}

const STAFF_ROLES_SCHEDULE = new Set([
  'admin',
  'supervisor',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
])

export function AgendaPageClient({
  currentUserRole,
  currentUserId,
  initialAppointments,
  childrenList: childrenProp,
  therapists,
  closures,
}: AgendaPageClientProps) {
  const isTherapist = currentUserRole === 'terapista'
  const canSchedule = STAFF_ROLES_SCHEDULE.has(currentUserRole)

  // Filtros
  const [filterTherapistId, setFilterTherapistId] = useState<string | null>(
    isTherapist ? currentUserId : null,
  )
  const [filterEventTypes, setFilterEventTypes] = useState<Set<EventType>>(new Set())
  const [filterVirtualOnly, setFilterVirtualOnly] = useState(false)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitial, setModalInitial] = useState<{
    starts_at?: string
    appointment?: Appointment
  }>({})

  // Convertir citas a bloques de calendar
  const events = useMemo<CalendarBlock[]>(() => {
    const filtered = initialAppointments.filter((a) => {
      if (filterTherapistId && a.therapist_id !== filterTherapistId) return false
      if (filterEventTypes.size > 0 && !filterEventTypes.has(a.event_type)) return false
      if (filterVirtualOnly && a.modality !== 'virtual') return false
      // Ocultar canceladas/reagendadas en la vista
      if (a.status === 'rescheduled') return false
      return true
    })

    return filtered.map((a) => {
      const child = childrenProp.find((c) => c.id === a.child_id)
      const therapist = therapists.find((t) => t.id === a.therapist_id)
      const childLabel = child?.full_name ?? 'Niño/a'
      const therapistLabel = therapist?.full_name ?? '—'
      const title =
        a.event_type === 'terapia'
          ? `${childLabel} · ${therapistLabel}`
          : `${EVENT_TYPE_LABELS[a.event_type]} · ${childLabel}`
      return {
        id: a.id,
        title,
        start: new Date(a.starts_at),
        end: new Date(a.ends_at),
        appointment: a,
      }
    })
  }, [initialAppointments, filterTherapistId, filterEventTypes, filterVirtualOnly, childrenProp, therapists])

  const handleSelectSlot = useCallback(
    ({ start }: { start: Date; end: Date }) => {
      if (!canSchedule) return
      // Validar cierre
      const closure = findClosureAffecting(start.toISOString(), closures)
      if (closure) {
        const ok = window.confirm(
          `Centro cerrado ese día: ${closure.name}.\n\n¿Agendar de todos modos? (solo admin puede confirmar el override real al guardar)`,
        )
        if (!ok) return
      }
      setModalInitial({ starts_at: start.toISOString() })
      setModalOpen(true)
    },
    [canSchedule, closures],
  )

  const handleSelectEvent = useCallback(
    (block: CalendarBlock) => {
      setModalInitial({ appointment: block.appointment })
      setModalOpen(true)
    },
    [],
  )

  const eventStyleGetter = useCallback((block: CalendarBlock) => {
    const colors = EVENT_TYPE_COLORS[block.appointment.event_type]
    // RBC consume colores hex; usamos custom CSS via style + classNames
    return {
      className: `kinetic-event ${colors.bg} ${colors.text} ${colors.border}`,
      style: {
        border: '1px solid transparent',
        borderRadius: '6px',
        fontSize: '11px',
        padding: '2px 4px',
      },
    }
  }, [])

  const dayPropGetter = useCallback(
    (date: Date) => {
      const closure = findClosureAffecting(date.toISOString(), closures)
      if (closure) {
        return {
          className: 'kinetic-closed-day',
          style: { backgroundColor: 'rgba(229, 49, 110, 0.06)' },
        }
      }
      return {}
    },
    [closures],
  )

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar de filtros */}
      <aside className="lg:w-64 border-b lg:border-b-0 lg:border-r border-fm-outline-variant/20 bg-fm-surface-container-low p-4 space-y-5 overflow-y-auto">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-2">
            Terapista
          </h3>
          {isTherapist ? (
            <p className="text-xs text-fm-on-surface-variant">Solo tus citas (filtro fijo)</p>
          ) : (
            <select
              value={filterTherapistId ?? ''}
              onChange={(e) => setFilterTherapistId(e.target.value || null)}
              className="w-full text-sm px-3 py-2 bg-fm-surface-container-lowest border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
            >
              <option value="">Todos</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-2">
            Tipo de evento
          </h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
            {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([code, label]) => {
              const active = filterEventTypes.has(code)
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setFilterEventTypes((prev) => {
                      const next = new Set(prev)
                      if (next.has(code)) next.delete(code)
                      else next.add(code)
                      return next
                    })
                  }
                  className={`text-[10px] min-h-[32px] px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-fm-primary/10 border-fm-primary text-fm-primary'
                      : 'bg-fm-surface-container-lowest border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs text-fm-on-surface cursor-pointer">
            <input
              type="checkbox"
              checked={filterVirtualOnly}
              onChange={(e) => setFilterVirtualOnly(e.target.checked)}
              className="rounded border-fm-surface-container-high"
            />
            Solo citas virtuales
          </label>
        </div>

        {canSchedule && (
          <div className="pt-3 border-t border-fm-outline-variant/15">
            <button
              type="button"
              onClick={() => {
                setModalInitial({})
                setModalOpen(true)
              }}
              className="w-full inline-flex items-center justify-center min-h-[44px] gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim transition-colors"
            >
              + Nueva cita
            </button>
          </div>
        )}

        <div className="pt-3 border-t border-fm-outline-variant/15 text-[10px] text-fm-on-surface-variant space-y-1">
          <p>
            Días con fondo rosa = centro cerrado.
          </p>
          <p>
            Click en slot vacío para crear cita.
          </p>
        </div>
      </aside>

      {/* Calendario */}
      <div className="flex-1 calendar-wrapper p-3 overflow-auto">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          defaultView={Views.WEEK}
          step={15}
          timeslots={2}
          min={workDayMin}
          max={workDayMax}
          selectable={canSchedule}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayPropGetter}
          culture="es"
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

      {modalOpen && (
        <AppointmentForm
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialStartsAt={modalInitial.starts_at}
          existingAppointment={modalInitial.appointment}
          childrenList={childrenProp}
          therapists={therapists}
          closures={closures}
          isAdmin={currentUserRole === 'admin'}
          canSchedule={canSchedule}
        />
      )}
    </div>
  )
}
