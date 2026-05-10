import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { MiDiaClient } from './MiDiaClient'
import { PendingProgressReportsBanner } from '@/components/agenda/PendingProgressReportsBanner'
import { summarizeActiveTherapiesForTherapist } from '@/lib/domain/progress-reports-pending'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { Appointment, TherapySession, ChildJournalEntry, SessionReport } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['terapista', 'maestra']
const TZ = 'America/El_Salvador'
const UPCOMING_DAYS = 3

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

function svDayBoundary(now: Date, dayOffset: number): Date {
  const nowInSV = toZonedTime(now, TZ)
  return fromZonedTime(
    new Date(
      nowInSV.getFullYear(),
      nowInSV.getMonth(),
      nowInSV.getDate() + dayOffset,
      0,
      0,
      0,
    ),
    TZ,
  )
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat('es-SV', {
    weekday: 'long',
    timeZone: TZ,
  }).format(date)
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('es-SV', {
    day: '2-digit',
    timeZone: TZ,
  }).format(date)
}

function formatMonthShort(date: Date): string {
  return new Intl.DateTimeFormat('es-SV', {
    month: 'short',
    timeZone: TZ,
  })
    .format(date)
    .replace('.', '')
}

export default async function MiDiaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const { role, id: userId } = ctx.appUser
  if (!ALLOWED_ROLES.includes(role)) redirect('/agenda')

  const supabase = await createClient()

  const now = new Date()
  const todayStart = svDayBoundary(now, 0)
  const tomorrowStart = svDayBoundary(now, 1)
  const upcomingEnd = svDayBoundary(now, 1 + UPCOMING_DAYS)

  // Today's appointments
  const { data: appointmentsRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('therapist_id', userId)
    .gte('starts_at', todayStart.toISOString())
    .lt('starts_at', tomorrowStart.toISOString())
    .not('status', 'eq', 'rescheduled')
    .order('starts_at')

  const appointments = (appointmentsRaw ?? []) as Appointment[]

  // Upcoming N days appointments (tomorrow → +N)
  const { data: upcomingRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('therapist_id', userId)
    .gte('starts_at', tomorrowStart.toISOString())
    .lt('starts_at', upcomingEnd.toISOString())
    .not('status', 'eq', 'rescheduled')
    .order('starts_at')

  const upcoming = (upcomingRaw ?? []) as Appointment[]

  const { data: sessionsRaw } = await supabase
    .from('therapy_sessions')
    .select('*')
    .eq('therapist_id', userId)
    .gte('started_at', todayStart.toISOString())

  const sessions = (sessionsRaw ?? []) as TherapySession[]

  const sessionIds = sessions.map((s) => s.id)
  const { data: reportsRaw } = sessionIds.length
    ? await supabase.from('session_reports').select('*').in('session_id', sessionIds)
    : { data: [] }
  const reportsBySession: Record<string, SessionReport> = Object.fromEntries(
    ((reportsRaw ?? []) as SessionReport[]).map((r) => [r.session_id, r]),
  )

  // Children involved (today + upcoming)
  const childIds = Array.from(
    new Set(
      [...appointments, ...upcoming]
        .map((a) => a.child_id)
        .filter(Boolean) as string[],
    ),
  )

  const entriesByChild: Record<string, ChildJournalEntry[]> = {}
  if (childIds.length > 0) {
    const { data: entriesRaw } = await supabase
      .from('child_journal_entries')
      .select('*')
      .in('child_id', childIds)
      .order('created_at', { ascending: false })

    for (const e of (entriesRaw ?? []) as ChildJournalEntry[]) {
      if (!entriesByChild[e.child_id]) entriesByChild[e.child_id] = []
      entriesByChild[e.child_id].push(e)
    }
  }

  const authorIds = Array.from(
    new Set(
      Object.values(entriesByChild)
        .flat()
        .map((e) => e.author_user_id)
        .filter(Boolean) as string[],
    ),
  )
  const { data: authorsRaw } = authorIds.length
    ? await supabase.from('users').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const authorNames = Object.fromEntries(
    (authorsRaw ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]),
  )

  // Enrich appointments (today + upcoming) with child names
  let appointmentsEnriched: AppointmentWithChild[] = appointments
  let upcomingEnriched: AppointmentWithChild[] = upcoming
  if (childIds.length > 0) {
    const { data: childrenRaw } = await supabase
      .from('children')
      .select('id, full_name, preferred_name')
      .in('id', childIds)
    const childMap = Object.fromEntries(
      (childrenRaw ?? []).map(
        (c: { id: string; full_name: string; preferred_name: string | null }) => [c.id, c],
      ),
    )
    const enrich = (a: Appointment): AppointmentWithChild => {
      const child = a.child_id ? childMap[a.child_id] : null
      if (!child) return a
      return {
        ...a,
        child_full_name: child.full_name,
        child_preferred_name: child.preferred_name ?? undefined,
      }
    }
    appointmentsEnriched = appointments.map(enrich)
    upcomingEnriched = upcoming.map(enrich)
  }

  // Group upcoming by day (3 entries, even if some have no appointments)
  const upcomingByDay = Array.from({ length: UPCOMING_DAYS }).map((_, idx) => {
    const dayStart = svDayBoundary(now, 1 + idx)
    const dayEnd = svDayBoundary(now, 2 + idx)
    const dayAppts = upcomingEnriched.filter(
      (a) => a.starts_at >= dayStart.toISOString() && a.starts_at < dayEnd.toISOString(),
    )
    return {
      dateISO: dayStart.toISOString(),
      weekday: formatWeekday(dayStart),
      day: formatDay(dayStart),
      month: formatMonthShort(dayStart),
      appointments: dayAppts,
    }
  })

  // Date anchor labels (today)
  const todayLabels = {
    weekday: formatWeekday(todayStart),
    day: formatDay(todayStart),
    month: formatMonthShort(todayStart),
    initialTime: new Intl.DateTimeFormat('es-SV', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: TZ,
    }).format(now),
  }

  const monthLabel = formatMonthShort(todayStart)

  const activeTherapiesSummary = await summarizeActiveTherapiesForTherapist(supabase, userId)
  const summaryChildIds = Array.from(new Set(activeTherapiesSummary.map((p) => p.childId)))
  let familyIdByChild: Record<string, string> = {}
  if (summaryChildIds.length > 0) {
    const { data: summaryChildrenRaw } = await supabase
      .from('children')
      .select('id, family_id')
      .in('id', summaryChildIds)
    familyIdByChild = Object.fromEntries(
      (summaryChildrenRaw ?? []).map((c) => [c.id, c.family_id]),
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Mi día" />
      <div className="flex-1 px-4 py-6 md:px-10 md:py-10 max-w-[1280px] mx-auto w-full">
        <PendingProgressReportsBanner
          summary={activeTherapiesSummary}
          familyIdByChild={familyIdByChild}
        />
        <MiDiaClient
          appointments={appointmentsEnriched}
          sessions={sessions}
          reportsBySession={reportsBySession}
          entriesByChild={entriesByChild}
          authorNames={authorNames}
          currentUserId={userId}
          todayLabels={todayLabels}
          upcomingByDay={upcomingByDay}
          monthLabel={monthLabel}
        />
      </div>
    </div>
  )
}
