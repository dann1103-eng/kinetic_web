'use client'

import { useMemo, useState } from 'react'
import {
  EVENT_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  type Appointment,
  type Child,
} from '@/types/db'
import { formatDateTime, isJoinable } from '@/lib/domain/appointment'

type ChildLite = Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'current_phase_code'>
type TherapistLite = { id: string; full_name: string; avatar_url: string | null }

interface PortalAgendaListProps {
  appointments: Appointment[]
  childrenList: ChildLite[]
  therapists: TherapistLite[]
}

export function PortalAgendaList({ appointments, childrenList: childrenProp, therapists }: PortalAgendaListProps) {
  const [filterChildId, setFilterChildId] = useState<string | null>(null)
  const showChildFilter = childrenProp.length > 1

  const filtered = useMemo(
    () => (filterChildId ? appointments.filter((a) => a.child_id === filterChildId) : appointments),
    [appointments, filterChildId],
  )

  // Agrupar por día
  const groupedByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of filtered) {
      const dayKey = a.starts_at.slice(0, 10)
      if (!map.has(dayKey)) map.set(dayKey, [])
      map.get(dayKey)!.push(a)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {showChildFilter && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filterChildId === null}
            onClick={() => setFilterChildId(null)}
            className={`min-h-[36px] text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filterChildId === null
                ? 'bg-fm-primary/10 border-fm-primary text-fm-primary'
                : 'bg-fm-surface-container-low border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'
            }`}
          >
            Todos los niños
          </button>
          {childrenProp.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filterChildId === c.id}
              onClick={() => setFilterChildId(c.id)}
              className={`min-h-[36px] text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterChildId === c.id
                  ? 'bg-fm-primary/10 border-fm-primary text-fm-primary'
                  : 'bg-fm-surface-container-low border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'
              }`}
            >
              {c.full_name}
            </button>
          ))}
        </div>
      )}

      {groupedByDay.length === 0 ? (
        <div className="text-center py-14 px-6">
          <p className="text-base text-fm-on-surface font-medium">No hay citas próximas.</p>
          <p className="text-sm text-fm-on-surface-variant mt-1 max-w-prose mx-auto">
            Cuando Kinetic agende la siguiente sesión, aparecerá acá. Si necesitás cambiar un horario, comunicate por WhatsApp al 7743-8666.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(([day, dayAppts]) => (
            <section key={day}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-3">
                {formatDayHeading(day)}
              </h2>
              <div className="space-y-3">
                {dayAppts.map((appt) => {
                  const child = childrenProp.find((c) => c.id === appt.child_id)
                  const therapist = therapists.find((t) => t.id === appt.therapist_id)
                  const joinable = appt.modality === 'virtual' && appt.meet_link && isJoinable(appt.starts_at, appt.ends_at)
                  return (
                    <article
                      key={appt.id}
                      className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 sm:p-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-fm-on-surface">
                              {child?.full_name ?? 'Niño/a'}
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
                              {appt.event_type === 'terapia' && appt.service_type
                                ? SERVICE_TYPE_LABELS[appt.service_type]
                                : EVENT_TYPE_LABELS[appt.event_type]}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              appt.modality === 'virtual'
                                ? 'bg-fm-secondary/15 text-fm-secondary'
                                : 'bg-fm-tertiary/15 text-fm-tertiary'
                            }`}>
                              {appt.modality === 'virtual' ? 'virtual' : 'presencial'}
                            </span>
                            {appt.status === 'replacement' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-tertiary text-white font-semibold uppercase tracking-wider">
                                Reposición
                              </span>
                            )}
                            {appt.status === 'rescheduled' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-on-surface-variant/70 text-white font-semibold uppercase tracking-wider">
                                Reagendada
                              </span>
                            )}
                            {therapist && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-kp-primary-container/15 text-kp-primary px-2 py-0.5 rounded-full">
                                <span className="material-symbols-outlined text-[12px]">person</span>
                                con {therapist.full_name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-fm-on-surface-variant">
                            {formatDateTime(appt.starts_at)}
                          </p>
                        </div>
                        {joinable && (
                          <a
                            href={appt.meet_link!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center min-h-[44px] gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim transition-colors"
                          >
                            Unirse a la reunión
                          </a>
                        )}
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-fm-on-surface-variant mt-3 max-w-prose whitespace-pre-wrap">
                          {appt.notes}
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-fm-on-surface-variant/70 text-center pt-4 max-w-prose mx-auto">
        Para cambios de horario, cancelaciones o cualquier consulta, escribinos por WhatsApp al{' '}
        <a href="https://wa.me/50377438666" className="font-medium text-fm-primary hover:underline">
          7743-8666
        </a>
        .
      </p>
    </div>
  )
}

function formatDayHeading(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T12:00:00')
  return d.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })
}
