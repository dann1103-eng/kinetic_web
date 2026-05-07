'use client'

import { useState } from 'react'
import { SessionCard } from '@/components/agenda/SessionCard'
import { ChildJournal } from '@/components/agenda/ChildJournal'
import type { Appointment, TherapySession, ChildJournalEntry } from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

interface MiDiaClientProps {
  appointments: AppointmentWithChild[]
  sessions: TherapySession[]
  entriesByChild: Record<string, ChildJournalEntry[]>
  authorNames: Record<string, string>
  currentUserId: string
}

export function MiDiaClient({
  appointments,
  sessions,
  entriesByChild,
  authorNames,
}: MiDiaClientProps) {
  const [openJournalForAppt, setOpenJournalForAppt] = useState<string | null>(null)

  const sessionByAppt = Object.fromEntries(
    sessions.map((s) => [s.appointment_id, s])
  )

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

        return (
          <div key={appt.id}>
            <SessionCard
              appointment={appt}
              session={session}
              onNoteClick={(id) =>
                setOpenJournalForAppt((prev) => (prev === id ? null : id))
              }
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
    </div>
  )
}
