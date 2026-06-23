'use client'

import { useState, useTransition } from 'react'
import { DateAnchor } from '@/components/mi-dia/DateAnchor'
import { TodaySessionsSection } from '@/components/mi-dia/TodaySessionsSection'
import {
  UpcomingTimelineSection,
  type UpcomingDay,
} from '@/components/mi-dia/UpcomingTimelineSection'
import { SessionReportModal } from '@/components/agenda/SessionReportModal'
import {
  WeekCompletedSection,
  type WeekCompletedItem,
} from '@/components/mi-dia/WeekCompletedSection'
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

interface TodayLabels {
  weekday: string
  day: string
  month: string
  initialTime: string
}

interface MiDiaClientProps {
  appointments: AppointmentWithChild[]
  sessions: TherapySession[]
  reportsBySession: Record<string, SessionReport>
  entriesByChild: Record<string, ChildJournalEntry[]>
  authorNames: Record<string, string>
  currentUserId: string
  todayLabels: TodayLabels
  upcomingByDay: UpcomingDay[]
  monthLabel: string
  weekItems: WeekCompletedItem[]
}

export function MiDiaClient({
  appointments,
  sessions,
  reportsBySession: initialReportsBySession,
  entriesByChild,
  authorNames,
  todayLabels,
  upcomingByDay,
  monthLabel,
  weekItems,
}: MiDiaClientProps) {
  const [tab, setTab] = useState<'hoy' | 'semana'>('hoy')
  const [openJournalForAppt, setOpenJournalForAppt] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, SessionReport>>(
    initialReportsBySession,
  )
  const [openReport, setOpenReport] = useState<{
    sessionId: string
    childName: string
  } | null>(null)
  const [isOpening, startOpenTransition] = useTransition()

  const sessionByAppt: Record<string, TherapySession | undefined> = Object.fromEntries(
    sessions.map((s) => [s.appointment_id, s] as const),
  )

  const handleNoteClick = (apptId: string) => {
    setOpenJournalForAppt((prev) => (prev === apptId ? null : apptId))
  }

  const handleReportClick = (sessionId: string, childName: string) => {
    if (isOpening) return
    startOpenTransition(async () => {
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

  return (
    <div className="grid grid-cols-12 gap-8 lg:gap-12 items-start mt-2">
      <DateAnchor
        weekday={todayLabels.weekday}
        day={todayLabels.day}
        month={todayLabels.month}
        initialTimeLabel={todayLabels.initialTime}
        className="col-span-12 lg:col-span-4 lg:sticky lg:top-6"
      />

      <div className="col-span-12 lg:col-span-8 space-y-12">
        <div className="inline-flex rounded-full border border-fm-outline-variant/40 p-0.5 bg-fm-surface-container-low">
          {(['hoy', 'semana'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                t === tab
                  ? 'bg-fm-primary text-white'
                  : 'text-fm-on-surface-variant hover:text-fm-on-surface'
              }`}
            >
              {t === 'hoy' ? 'Hoy' : 'Mi semana'}
            </button>
          ))}
        </div>

        {tab === 'hoy' ? (
          <>
            <TodaySessionsSection
              appointments={appointments}
              sessionByAppt={sessionByAppt}
              reports={reports}
              entriesByChild={entriesByChild}
              authorNames={authorNames}
              openJournalForAppt={openJournalForAppt}
              onNoteClick={handleNoteClick}
              onReportClick={handleReportClick}
            />

            <UpcomingTimelineSection days={upcomingByDay} monthLabel={monthLabel} />
          </>
        ) : (
          <WeekCompletedSection items={weekItems} onReportClick={handleReportClick} />
        )}
      </div>

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
          onDeleted={() => {
            setReports((prev) => {
              const next = { ...prev }
              delete next[activeReport.session_id]
              return next
            })
            setOpenReport(null)
          }}
        />
      )}
    </div>
  )
}
