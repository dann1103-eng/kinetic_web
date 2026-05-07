'use client'

import { useState, useTransition } from 'react'
import { SessionCard } from '@/components/agenda/SessionCard'
import { ChildJournal } from '@/components/agenda/ChildJournal'
import { SessionReportModal } from '@/components/agenda/SessionReportModal'
import { createOrGetSessionReport } from '@/app/actions/session-reports'
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

interface MiDiaClientProps {
  appointments: AppointmentWithChild[]
  sessions: TherapySession[]
  reportsBySession: Record<string, SessionReport>
  entriesByChild: Record<string, ChildJournalEntry[]>
  authorNames: Record<string, string>
  currentUserId: string
}

export function MiDiaClient({
  appointments,
  sessions,
  reportsBySession: initialReportsBySession,
  entriesByChild,
  authorNames,
}: MiDiaClientProps) {
  const [openJournalForAppt, setOpenJournalForAppt] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, SessionReport>>(initialReportsBySession)
  const [openReport, setOpenReport] = useState<{ sessionId: string; childName: string } | null>(null)
  const [isOpening, startOpenTransition] = useTransition()

  const sessionByAppt = Object.fromEntries(
    sessions.map((s) => [s.appointment_id, s]),
  )

  const handleReportClick = (sessionId: string, childName: string) => {
    startOpenTransition(async () => {
      // Si el reporte ya existe en state, abrir directo; si no, crearlo y cargar.
      if (!reports[sessionId]) {
        const res = await createOrGetSessionReport(sessionId)
        if (!res.ok) {
          alert(res.error)
          return
        }
        setReports((prev) => ({ ...prev, [sessionId]: res.report }))
      }
      setOpenReport({ sessionId, childName })
    })
  }

  const activeReport = openReport ? reports[openReport.sessionId] : null

  if (appointments.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-fm-on-surface-variant">
        No tienes citas programadas para hoy.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {appointments.map((appt) => {
        const session = sessionByAppt[appt.id] ?? null
        const showJournal = openJournalForAppt === appt.id
        const childEntries = appt.child_id ? (entriesByChild[appt.child_id] ?? []) : []
        const childName = appt.child_preferred_name ?? appt.child_full_name ?? 'Paciente'
        const report = session ? reports[session.id] ?? null : null

        return (
          <div key={appt.id}>
            <SessionCard
              appointment={appt}
              session={session}
              report={report}
              onNoteClick={(id) =>
                setOpenJournalForAppt((prev) => (prev === id ? null : id))
              }
              onReportClick={() => session && !isOpening && handleReportClick(session.id, childName)}
            />
            {showJournal && appt.child_id && (
              <div className="mt-2 ml-4 pl-4 border-l-2 border-fm-primary/20">
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

      {openReport && activeReport && (
        <SessionReportModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setOpenReport(null)
          }}
          report={activeReport}
          childName={openReport.childName}
          onReportUpdated={(updated) =>
            setReports((prev) => ({ ...prev, [updated.session_id]: updated }))
          }
        />
      )}
    </div>
  )
}
