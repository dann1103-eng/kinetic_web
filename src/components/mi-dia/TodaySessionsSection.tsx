'use client'

import { BigSessionCard } from './BigSessionCard'
import { ChildJournal } from '@/components/agenda/ChildJournal'
import type {
  Appointment,
  TherapySession,
  ChildJournalEntry,
  SessionReport,
} from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

interface TodaySessionsSectionProps {
  appointments: AppointmentWithChild[]
  sessionByAppt: Record<string, TherapySession | undefined>
  reports: Record<string, SessionReport>
  entriesByChild: Record<string, ChildJournalEntry[]>
  authorNames: Record<string, string>
  openJournalForAppt: string | null
  onNoteClick: (apptId: string) => void
  onReportClick: (sessionId: string, childName: string) => void
}

export function TodaySessionsSection({
  appointments,
  sessionByAppt,
  reports,
  entriesByChild,
  authorNames,
  openJournalForAppt,
  onNoteClick,
  onReportClick,
}: TodaySessionsSectionProps) {
  // Pick the "primary" card: first scheduled or in_progress, else first appointment.
  const primaryId =
    appointments.find((a) => a.status === 'in_progress')?.id ??
    appointments.find((a) => a.status === 'scheduled')?.id ??
    appointments[0]?.id

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-fm-on-surface">Citas de hoy</h2>
        <span className="px-4 py-2 bg-fm-surface-container rounded-full text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
          {appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}
        </span>
      </div>

      {appointments.length === 0 ? (
        <div className="rounded-[40px] bg-fm-surface-variant p-12 text-center text-sm text-fm-on-surface-variant">
          No tienes citas programadas para hoy.
        </div>
      ) : (
        <div className="space-y-6">
          {appointments.map((appt) => {
            const session = sessionByAppt[appt.id] ?? null
            const showJournal = openJournalForAppt === appt.id
            const childEntries = appt.child_id ? entriesByChild[appt.child_id] ?? [] : []
            const childName =
              appt.child_preferred_name ?? appt.child_full_name ?? 'Paciente'
            const report = session ? reports[session.id] ?? null : null
            const variant = appt.id === primaryId ? 'primary' : 'secondary'

            return (
              <div key={appt.id}>
                <BigSessionCard
                  appointment={appt}
                  session={session}
                  report={report}
                  variant={variant}
                  onNoteClick={onNoteClick}
                  onReportClick={() => session && onReportClick(session.id, childName)}
                />
                {showJournal && appt.child_id && (
                  <div className="mt-3 ml-6 pl-4 border-l-2 border-fm-primary/20">
                    <ChildJournal
                      entries={childEntries}
                      childId={appt.child_id}
                      isFamily={false}
                      canWrite={true}
                      linkedAppointmentId={appt.id}
                      authorNames={authorNames}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
