import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { MiDiaClient } from './MiDiaClient'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { Appointment, TherapySession, ChildJournalEntry } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['terapista', 'maestra']
const TZ = 'America/El_Salvador'

export default async function MiDiaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const { role, id: userId } = ctx.appUser
  if (!ALLOWED_ROLES.includes(role)) redirect('/agenda')

  const supabase = await createClient()

  // Today's boundaries in El Salvador timezone (UTC-6)
  const nowInSV = toZonedTime(new Date(), TZ)
  const todayStart = fromZonedTime(
    new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate(), 0, 0, 0),
    TZ
  )
  const tomorrowStart = fromZonedTime(
    new Date(nowInSV.getFullYear(), nowInSV.getMonth(), nowInSV.getDate() + 1, 0, 0, 0),
    TZ
  )

  const { data: appointmentsRaw } = await supabase
    .from('appointments')
    .select('*')
    .eq('therapist_id', userId)
    .gte('starts_at', todayStart.toISOString())
    .lt('starts_at', tomorrowStart.toISOString())
    .not('status', 'eq', 'rescheduled')
    .order('starts_at')

  const appointments = (appointmentsRaw ?? []) as Appointment[]

  const { data: sessionsRaw } = await supabase
    .from('therapy_sessions')
    .select('*')
    .eq('therapist_id', userId)
    .gte('started_at', todayStart.toISOString())

  const sessions = (sessionsRaw ?? []) as TherapySession[]

  // Journal entries for children in today's appointments
  const childIds = Array.from(
    new Set(appointments.map((a) => a.child_id).filter(Boolean) as string[])
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

  // Author names for entries
  const authorIds = Array.from(
    new Set(
      Object.values(entriesByChild)
        .flat()
        .map((e) => e.author_user_id)
        .filter(Boolean) as string[]
    )
  )
  const { data: authorsRaw } = authorIds.length
    ? await supabase.from('users').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const authorNames = Object.fromEntries(
    (authorsRaw ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name])
  )

  // Enrich appointments with child names
  if (childIds.length > 0) {
    const { data: childrenRaw } = await supabase
      .from('children')
      .select('id, full_name, preferred_name')
      .in('id', childIds)
    const childMap = Object.fromEntries(
      (childrenRaw ?? []).map((c: { id: string; full_name: string; preferred_name: string | null }) => [c.id, c])
    )
    for (const appt of appointments) {
      const child = appt.child_id ? childMap[appt.child_id] : null
      if (child) {
        ;(appt as Appointment & { child_full_name?: string; child_preferred_name?: string }).child_full_name =
          child.full_name
        ;(appt as Appointment & { child_preferred_name?: string }).child_preferred_name =
          child.preferred_name ?? undefined
      }
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Mi día" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">
        <MiDiaClient
          appointments={appointments as (Appointment & { child_full_name?: string; child_preferred_name?: string })[]}
          sessions={sessions}
          entriesByChild={entriesByChild}
          authorNames={authorNames}
          currentUserId={userId}
        />
      </div>
    </div>
  )
}
