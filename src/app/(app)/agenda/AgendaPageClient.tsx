'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { moveAppointment } from '@/app/actions/appointments'
import {
  EVENT_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  type Appointment,
  type Child,
  type EventType,
  type ServiceType,
  type InstitutionalClosure,
  type MorningProgram,
} from '@/types/db'
import { findClosureAffecting } from '@/lib/domain/appointment'
import { AppointmentForm, type EvalCatalogItem } from '@/components/agenda/AppointmentForm'
import {
  KineticCalendar,
  paletteFor,
  therapistColorKey,
  type KineticEventDatum,
} from '@/components/calendar/KineticCalendar'
import { getSessionRoster, type RosterEntry } from '@/app/actions/program-groups'

type ChildLite = Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'current_phase_code'>
type TherapistLite = { id: string; full_name: string; role: string; avatar_url: string | null }

export type GroupSessionForClient = {
  id: string
  groupName: string
  program: MorningProgram
  staffNames: string[]
  /** IDs de la(s) maestra(s) del grupo — para filtrar por terapista en la agenda. */
  staffUserIds: string[]
  starts_at: string
  ends_at: string
  status: string
}

interface AgendaPageClientProps {
  currentUserRole: string
  currentUserId: string
  initialAppointments: Appointment[]
  groupSessions: GroupSessionForClient[]
  childrenList: ChildLite[]
  therapists: TherapistLite[]
  closures: InstitutionalClosure[]
  evalCatalog: EvalCatalogItem[]
}

// Un bloque puede ser una cita individual O una sesión de grupo (read-only).
type CalendarBlock = KineticEventDatum & (
  | { kind: 'appointment'; appointment: Appointment; groupSession?: never }
  | { kind: 'group'; groupSession: GroupSessionForClient; appointment?: never }
)

const PROGRAM_LABEL: Record<MorningProgram, string> = {
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
}

// Color fijo para cada programa matutino en el calendario.
const PROGRAM_COLOR_KEY: Record<MorningProgram, string> = {
  blue_kids: 'blue_kids',
  learning_kids: 'learning_kids',
  aula_educativa: 'aula_educativa',
}

const STAFF_ROLES_SCHEDULE = new Set([
  'admin',
  'supervisor',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
])

// Roles que pueden mover citas por drag-and-drop (debe coincidir con DRAG_ROLES
// del server action moveAppointment).
const DRAG_ROLES = new Set([
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
])

// Roles que pueden pre-marcar inasistencia (debe coincidir con la autorización de
// la RPC mark_appointment_absence en la migración 0159).
const ABSENCE_ROLES = new Set([
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
])

export function AgendaPageClient({
  currentUserRole,
  currentUserId,
  initialAppointments,
  groupSessions,
  childrenList: childrenProp,
  therapists,
  closures,
  evalCatalog,
}: AgendaPageClientProps) {
  // Maestras y terapistas quedan bloqueados a su propia agenda (mismas
  // restricciones: solo ven las citas donde son el terapista asignado).
  const isTherapist = currentUserRole === 'terapista' || currentUserRole === 'maestra'
  const canSchedule = STAFF_ROLES_SCHEDULE.has(currentUserRole)
  // Solo coordinadoras / admin / directora / recepción pueden mover citas (DnD).
  const canDrag = DRAG_ROLES.has(currentUserRole)
  // Pre-marcar inasistencia (coordinación) — solo terapias.
  const canMarkAbsence = ABSENCE_ROLES.has(currentUserRole)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Posiciones optimistas tras un drag (id → nuevo rango). Se aplican sobre las
  // citas del prop para que el movimiento se vea al instante; el revalidate del
  // server las confirma. Si la acción falla, se revierte borrando el override.
  const [moveOverrides, setMoveOverrides] = useState<
    Record<string, { starts_at: string; ends_at: string }>
  >({})

  // Movimiento pendiente de confirmación (DnD/resize). Hasta confirmar no se aplica.
  const [pendingMove, setPendingMove] = useState<
    { event: CalendarBlock; start: Date; end: Date } | null
  >(null)

  // Filtros
  // Terapista: bloqueado a sí mismo. Otros: leen ?therapistId=XX del URL
  // (e.g., al venir desde /operacion/capacidad-terapistas), o sin filtro.
  const therapistIdFromUrl = searchParams.get('therapistId')
  const [filterTherapistId, setFilterTherapistId] = useState<string | null>(
    isTherapist ? currentUserId : therapistIdFromUrl,
  )
  const [filterEventTypes, setFilterEventTypes] = useState<Set<EventType>>(new Set())
  const [filterServiceTypes, setFilterServiceTypes] = useState<Set<ServiceType>>(new Set())
  const [filterVirtualOnly, setFilterVirtualOnly] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Modal de cita individual
  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitial, setModalInitial] = useState<{
    starts_at?: string
    appointment?: Appointment
  }>({})

  // Popover de sesión de grupo (read-only) + lista del día (lazy).
  const [groupPopover, setGroupPopover] = useState<GroupSessionForClient | null>(null)
  const [groupRoster, setGroupRoster] = useState<RosterEntry[] | null>(null)

  // Convertir citas + sesiones de grupo a bloques de calendar.
  const events = useMemo<CalendarBlock[]>(() => {
    // ── Citas individuales ────────────────────────────────────────────────
    const filtered = initialAppointments.filter((a) => {
      // Los programas matutinos se muestran como bloques de GRUPO (abajo), no como
      // citas individuales por niño. Las citas por-niño siguen existiendo para el
      // portal/calendario de la familia, pero no se pintan en la agenda de staff.
      if (a.event_type === 'programa_matutino') return false
      if (filterTherapistId && a.therapist_id !== filterTherapistId) return false
      if (filterEventTypes.size > 0 && !filterEventTypes.has(a.event_type)) return false
      if (filterServiceTypes.size > 0) {
        if (!a.service_type || !filterServiceTypes.has(a.service_type)) return false
      }
      if (filterVirtualOnly && a.modality !== 'virtual') return false
      if (a.status === 'rescheduled') return false
      return true
    })

    const apptBlocks: CalendarBlock[] = filtered.map((a) => {
      // Posición optimista tras un drag (si la hay) para que se vea al instante.
      const ov = moveOverrides[a.id]
      const startIso = ov?.starts_at ?? a.starts_at
      const endIso = ov?.ends_at ?? a.ends_at
      const child = childrenProp.find((c) => c.id === a.child_id)
      const therapist = therapists.find((t) => t.id === a.therapist_id)
      const childLabel = child?.full_name ?? 'Niño/a'
      const therapistLabel = therapist?.full_name ?? '—'
      const isTherapy = a.event_type === 'terapia'
      const eventLabel =
        a.event_type === 'otro' && a.custom_event_label
          ? a.custom_event_label
          : EVENT_TYPE_LABELS[a.event_type]
      const title = isTherapy ? childLabel : eventLabel
      const subtitle = isTherapy ? therapistLabel : childLabel
      // Color POR TERAPEUTA (cada color = una persona). Las inasistencias se
      // pintan en gris como referencia visual; los eventos sin terapista usan
      // el color del tipo de evento.
      const colorKey =
        a.status === 'no_show' || a.status === 'late_cancel'
          ? 'absence_gray'
          : a.therapist_id
            ? therapistColorKey(a.therapist_id)
            : a.event_type
      let tag: { label: string; tone: 'replacement' | 'rescheduled' | 'absence' } | null = null
      if (a.status === 'replacement') tag = { label: 'Reposición', tone: 'replacement' }
      else if (a.status === 'rescheduled') tag = { label: 'Reagendada', tone: 'rescheduled' }
      else if (a.status === 'no_show' || a.status === 'late_cancel') tag = { label: 'Inasistencia', tone: 'absence' }
      return {
        kind: 'appointment',
        id: a.id,
        title,
        subtitle,
        start: new Date(startIso),
        end: new Date(endIso),
        colorKey,
        tag,
        appointment: a,
      }
    })

    // ── Sesiones de grupo (read-only) ────────────────────────────────────
    // Si hay filtro de tipo de evento activo y no incluye programas matutinos,
    // ocultarlas. Si hay filtro de terapista activo, ocultarlas (los grupos no
    // tienen un único therapist_id). Si filterVirtualOnly, ocultarlas.
    const showGroups =
      !filterVirtualOnly &&
      filterServiceTypes.size === 0 &&
      (filterEventTypes.size === 0 || filterEventTypes.has('programa_matutino'))

    // Si hay filtro de terapista, mostrar solo los grupos donde esa persona es staff.
    const visibleGroupSessions = filterTherapistId
      ? groupSessions.filter((s) => s.staffUserIds.includes(filterTherapistId))
      : groupSessions

    const groupBlocks: CalendarBlock[] = showGroups
      ? visibleGroupSessions.map((s) => ({
          kind: 'group',
          id: `group-${s.id}`,
          title: `${PROGRAM_LABEL[s.program]} — ${s.groupName}`,
          subtitle: s.staffNames.length > 0 ? s.staffNames.join(', ') : 'Sin maestra asignada',
          start: new Date(s.starts_at),
          end: new Date(s.ends_at),
          colorKey: PROGRAM_COLOR_KEY[s.program],
          tag: s.status === 'held'
            ? { label: 'Lista pasada', tone: 'replacement' as const }
            : null,
          groupSession: s,
        }))
      : []

    return [...apptBlocks, ...groupBlocks]
  }, [initialAppointments, groupSessions, filterTherapistId, filterEventTypes, filterServiceTypes, filterVirtualOnly, childrenProp, therapists, moveOverrides])

  // Exportar PDF de las citas actualmente visibles (respeta filtros).
  const handleExportPdf = useCallback(() => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      const ids = events.filter((e) => e.kind === 'appointment').map((e) => e.appointment!.id)
      if (ids.length === 0) {
        window.alert('No hay citas que exportar con los filtros actuales.')
        return
      }
      params.set('ids', ids.join(','))
      if (filterTherapistId) {
        const t = therapists.find((x) => x.id === filterTherapistId)
        if (t) params.set('therapist', t.full_name)
      }
      window.open(`/api/agenda/pdf?${params.toString()}`, '_blank')
    } finally {
      setExporting(false)
    }
  }, [events, filterTherapistId, therapists])

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
      if (block.kind === 'group') {
        setGroupPopover(block.groupSession)
        setGroupRoster(null)
        getSessionRoster(block.groupSession.id).then((res) => {
          if (res.ok) setGroupRoster(res.roster)
        })
        return
      }
      setModalInitial({ appointment: block.appointment })
      setModalOpen(true)
    },
    [],
  )

  // Mover una cita (drag-and-drop o resize). NO se aplica al instante: primero se
  // pide confirmación (mover puede notificar a la terapista). Cambia solo esa cita.
  const handleMove = useCallback(
    ({ event, start, end }: { event: CalendarBlock; start: Date; end: Date }) => {
      if (!canDrag || event.kind !== 'appointment') return
      const appt = event.appointment
      if (!['scheduled', 'replacement'].includes(appt.status)) return
      const startIso = start.toISOString()
      const endIso = end.toISOString()
      if (startIso === appt.starts_at && endIso === appt.ends_at) return
      setPendingMove({ event, start, end })
    },
    [canDrag],
  )

  // Aplica el movimiento ya confirmado (optimista + server). Revierte si falla.
  const applyPendingMove = useCallback(() => {
    if (!pendingMove || pendingMove.event.kind !== 'appointment') return
    const appt = pendingMove.event.appointment
    const startIso = pendingMove.start.toISOString()
    const endIso = pendingMove.end.toISOString()
    setPendingMove(null)

    // Optimista: pintar de una vez en el nuevo horario.
    setMoveOverrides((prev) => ({ ...prev, [appt.id]: { starts_at: startIso, ends_at: endIso } }))

    moveAppointment(appt.id, startIso, endIso)
      .then((res) => {
        if (!res.ok) {
          // Revertir: quitar el override para que vuelva a su lugar.
          setMoveOverrides((prev) => {
            const next = { ...prev }
            delete next[appt.id]
            return next
          })
          window.alert(res.error)
        } else {
          router.refresh()
        }
      })
      .catch(() => {
        setMoveOverrides((prev) => {
          const next = { ...prev }
          delete next[appt.id]
          return next
        })
        window.alert('No se pudo mover la cita. Revisá tu conexión e intentá de nuevo.')
      })
  }, [pendingMove, router])

  const draggableAccessor = useCallback(
    (block: CalendarBlock) =>
      canDrag &&
      block.kind === 'appointment' &&
      ['scheduled', 'replacement'].includes(block.appointment.status),
    [canDrag],
  )

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

        {!isTherapist && therapists.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-2">
              Colores por terapeuta
            </h3>
            <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {therapists.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${paletteFor(therapistColorKey(t.id)).accent}`}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] text-fm-on-surface-variant truncate">{t.full_name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
              Tipo de terapia
            </h3>
            {filterServiceTypes.size > 0 && (
              <button
                type="button"
                onClick={() => setFilterServiceTypes(new Set())}
                className="text-[10px] text-fm-primary hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de terapia">
            {(Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][]).map(([code, label]) => {
              const active = filterServiceTypes.has(code)
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setFilterServiceTypes((prev) => {
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
          <div className="pt-3 border-t border-fm-outline-variant/15 space-y-2">
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
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting || events.length === 0}
              className="w-full inline-flex items-center justify-center min-h-[44px] gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-fm-primary/40 text-fm-primary hover:bg-fm-primary/5 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">picture_as_pdf</span>
              Exportar PDF
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
          {canDrag && (
            <p>
              Arrastrá una cita para moverla a otro horario (solo si el espacio está libre).
            </p>
          )}
        </div>
      </aside>

      {/* Calendario */}
      <div className="flex-1 p-4 overflow-auto min-h-0">
        <KineticCalendar<CalendarBlock>
          events={events}
          defaultView="week"
          step={15}
          timeslots={2}
          minHour={7}
          maxHour={19}
          selectable={canSchedule}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          dayPropGetter={dayPropGetter}
          onEventDrop={canDrag ? handleMove : undefined}
          onEventResize={canDrag ? handleMove : undefined}
          draggableAccessor={canDrag ? draggableAccessor : undefined}
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
          evalCatalog={evalCatalog}
          isAdmin={currentUserRole === 'admin'}
          canSchedule={canSchedule}
          canMarkAbsence={canMarkAbsence}
        />
      )}

      {pendingMove && pendingMove.event.kind === 'appointment' && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPendingMove(null)}
        >
          <div
            className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-fm-primary">
                Confirmar movimiento
              </p>
              <h3 className="text-base font-semibold text-fm-on-surface mt-1">
                ¿Mover{' '}
                {pendingMove.event.appointment.event_type === 'terapia'
                  ? `la terapia de ${pendingMove.event.title}`
                  : 'esta cita'}
                ?
              </h3>
            </div>
            <div className="text-sm text-fm-on-surface space-y-1">
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">
                  schedule
                </span>
                {new Intl.DateTimeFormat('es-SV', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(pendingMove.start)}
              </p>
              {(pendingMove.event.appointment.event_type === 'terapia' ||
                pendingMove.event.appointment.event_type === 'evaluacion') && (
                <p className="text-[11px] text-fm-on-surface-variant">
                  Se notificará a la terapista asignada.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                className="min-h-[44px] px-4 py-2 text-sm rounded-xl text-fm-on-surface-variant hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyPendingMove}
                className="min-h-[44px] px-4 py-2 text-sm rounded-xl bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim"
              >
                Sí, mover
              </button>
            </div>
          </div>
        </div>
      )}

      {groupPopover && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => { setGroupPopover(null); setGroupRoster(null) }}
        >
          <div
            className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-fm-primary">
                  {PROGRAM_LABEL[groupPopover.program]}
                </p>
                <h3 className="text-base font-semibold text-fm-on-surface mt-0.5">
                  {groupPopover.groupName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setGroupPopover(null); setGroupRoster(null) }}
                className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant shrink-0 mt-0.5">
                  schedule
                </span>
                <span className="text-fm-on-surface">
                  {new Date(groupPopover.starts_at).toLocaleTimeString('es-SV', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' – '}
                  {new Date(groupPopover.ends_at).toLocaleTimeString('es-SV', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant shrink-0 mt-0.5">
                  person
                </span>
                <span className="text-fm-on-surface">
                  {groupPopover.staffNames.length > 0
                    ? groupPopover.staffNames.join(', ')
                    : 'Sin maestra asignada'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant shrink-0">
                  event_available
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  groupPopover.status === 'held'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-fm-primary/10 text-fm-primary'
                }`}>
                  {groupPopover.status === 'held' ? 'Lista pasada' : 'Programada'}
                </span>
              </div>
            </div>

            {groupRoster && groupRoster.length > 0 && (
              <div className="pt-2 border-t border-fm-outline-variant/20">
                <p className="text-[11px] font-semibold text-fm-on-surface-variant mb-1">
                  Asisten hoy ({groupRoster.length})
                </p>
                <ul className="text-xs text-fm-on-surface space-y-0.5 max-h-40 overflow-y-auto">
                  {groupRoster.map((r) => (
                    <li key={r.child_id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{r.child_full_name}</span>
                      {r.status && (
                        <span className="text-[10px] text-fm-on-surface-variant shrink-0">
                          {r.status === 'present' ? 'Presente' : r.status === 'absent' ? 'Ausente' : 'Justificado'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {groupRoster && groupRoster.length === 0 && (
              <p className="text-[11px] text-fm-on-surface-variant italic pt-1">
                Ningún niño asignado para este día.
              </p>
            )}

            <p className="text-[11px] text-fm-on-surface-variant pt-1 border-t border-fm-outline-variant/20">
              Sesión de grupo — la lista se pasa en Mi día (maestra del grupo) o en
              Administración → Grupos.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
