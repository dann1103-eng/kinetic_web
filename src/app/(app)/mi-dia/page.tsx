import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { MiDiaClient } from './MiDiaClient'
import { PendingProgressReportsBanner } from '@/components/agenda/PendingProgressReportsBanner'
import { PendingAbsencesBanner } from '@/components/agenda/PendingAbsencesBanner'
import { GroupRosterSection, type TodayGroupSession } from '@/components/agenda/GroupRosterSection'
import { summarizeActiveTherapiesForTherapist } from '@/lib/domain/progress-reports-pending'
import { detectPendingAbsencesForTherapist } from '@/lib/domain/absences-pending'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type {
  Appointment,
  TherapySession,
  ChildJournalEntry,
  SessionReport,
  SessionReportStatus,
} from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['terapista', 'maestra', 'admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias']
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

  // ── Semana actual (lunes→domingo SV): terapias completadas + estado de reporte ──
  const nowInSV = toZonedTime(now, TZ)
  const dow = nowInSV.getDay() // 0=dom..6=sáb
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const weekStart = fromZonedTime(
    new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate() + mondayOffset, 0, 0, 0),
    TZ,
  )
  const weekEnd = fromZonedTime(
    new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate() + mondayOffset + 7, 0, 0, 0),
    TZ,
  )

  const { data: weekCompletedRaw } = await supabase
    .from('appointments')
    .select('id, child_id, service_type, starts_at, ends_at, status')
    .eq('therapist_id', userId)
    .eq('status', 'completed')
    .gte('starts_at', weekStart.toISOString())
    .lt('starts_at', weekEnd.toISOString())
    .order('starts_at')
  const weekCompletedAppts = (weekCompletedRaw ?? []) as {
    id: string
    child_id: string | null
    service_type: string | null
    starts_at: string
    ends_at: string
    status: string
  }[]

  const weekApptIds = weekCompletedAppts.map((a) => a.id)
  const { data: weekSessionsRaw } = weekApptIds.length
    ? await supabase.from('therapy_sessions').select('id, appointment_id').in('appointment_id', weekApptIds)
    : { data: [] as { id: string; appointment_id: string }[] }
  const weekSessionByAppt = new Map(
    ((weekSessionsRaw ?? []) as { id: string; appointment_id: string }[]).map((s) => [s.appointment_id, s.id]),
  )
  const weekSessionIds = Array.from(weekSessionByAppt.values())
  const { data: weekReportsRaw } = weekSessionIds.length
    ? await supabase.from('session_reports').select('session_id, status').in('session_id', weekSessionIds)
    : { data: [] as { session_id: string; status: string }[] }
  const weekReportStatusBySession = new Map(
    ((weekReportsRaw ?? []) as { session_id: string; status: string }[]).map((r) => [r.session_id, r.status]),
  )

  const weekChildIds = Array.from(
    new Set(weekCompletedAppts.map((a) => a.child_id).filter(Boolean) as string[]),
  )
  const { data: weekChildrenRaw } = weekChildIds.length
    ? await supabase.from('children').select('id, full_name, preferred_name').in('id', weekChildIds)
    : { data: [] as { id: string; full_name: string; preferred_name: string | null }[] }
  const weekChildMap = new Map(
    ((weekChildrenRaw ?? []) as { id: string; full_name: string; preferred_name: string | null }[]).map(
      (c) => [c.id, c.preferred_name || c.full_name],
    ),
  )

  const weekItems = weekCompletedAppts.map((a) => {
    const sessionId = weekSessionByAppt.get(a.id) ?? null
    return {
      appointmentId: a.id,
      sessionId,
      childName: (a.child_id ? weekChildMap.get(a.child_id) : null) ?? 'Niño/a',
      serviceType: a.service_type,
      startsAt: a.starts_at,
      reportStatus: (sessionId
        ? (weekReportStatusBySession.get(sessionId) as SessionReportStatus | undefined) ?? null
        : null) as SessionReportStatus | null,
    }
  })

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

  // Sesiones de grupo de HOY donde el usuario es staff (pasar lista).
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
  let todayGroupSessions: TodayGroupSession[] = []
  const { data: staffGroupsRaw } = await supabase
    .from('program_group_staff')
    .select('group_id')
    .eq('user_id', userId)
  const myGroupIds = (staffGroupsRaw ?? []).map((g) => g.group_id as string)
  if (myGroupIds.length > 0) {
    const [{ data: sessRaw }, { data: grpRaw }] = await Promise.all([
      supabase
        .from('program_group_sessions')
        .select('id, group_id, starts_at, status')
        .in('group_id', myGroupIds)
        .eq('session_date', todayStr)
        .neq('status', 'cancelled')
        .order('starts_at'),
      supabase.from('program_groups').select('id, name').in('id', myGroupIds),
    ])
    const nameById = new Map(
      ((grpRaw ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]),
    )
    todayGroupSessions = ((sessRaw ?? []) as {
      id: string
      group_id: string
      starts_at: string
      status: string
    }[]).map((s) => ({
      id: s.id,
      group_name: nameById.get(s.group_id) ?? 'Grupo',
      starts_at: s.starts_at,
      status: s.status,
    }))
  }

  // Resumen de terapias activas + inasistencias pendientes en paralelo.
  // El banner de progress reports usa activeTherapiesSummary; el banner de
  // inasistencias usa pendingAbsences. Ambos comparten familyIdByChild.
  const [activeTherapiesSummary, pendingAbsences] = await Promise.all([
    summarizeActiveTherapiesForTherapist(supabase, userId),
    detectPendingAbsencesForTherapist(supabase, userId),
  ])
  const summaryChildIds = Array.from(
    new Set([
      ...activeTherapiesSummary.map((p) => p.childId),
      ...pendingAbsences.map((p) => p.childId),
    ]),
  )
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
        <PendingAbsencesBanner
          items={pendingAbsences}
          familyIdByChild={familyIdByChild}
        />
        <GroupRosterSection sessions={todayGroupSessions} />
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
          weekItems={weekItems}
        />
      </div>
    </div>
  )
}
