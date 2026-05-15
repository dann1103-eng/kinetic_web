import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { PortalAgendaList } from './PortalAgendaList'
import { PortalCalendarWidget, type CalendarAppt } from '@/components/portal/PortalCalendarWidget'
import type { Appointment, Child } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PortalAgendaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Niños (RLS filtra por familia)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, code, full_name, family_id, treatment_status')
    .order('full_name')

  const children = (childrenRaw ?? []) as Pick<
    Child,
    'id' | 'code' | 'full_name' | 'family_id' | 'treatment_status'
  >[]

  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.full_name]),
  )

  // Fetch desde el primer día del mes en curso para que el calendario
  // muestre todas las citas del mes, incluyendo las ya pasadas del mes.
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data: appointmentsRaw } = await supabase
    .from('appointments')
    .select('*')
    .gte('starts_at', monthStart.toISOString())
    .in('status', ['scheduled', 'in_progress', 'replacement'])
    .order('starts_at')

  const allMonthAppts = (appointmentsRaw ?? []) as Appointment[]

  // Para la lista: solo citas desde hoy (no mostrar las pasadas del mes)
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const upcomingAppts = allMonthAppts.filter(
    (a) => new Date(a.starts_at) >= todayMidnight,
  )

  // Terapistas mencionados (para labels en la lista Y en el panel de detalle del calendario)
  const therapistIds = Array.from(
    new Set(allMonthAppts.map((a) => a.therapist_id).filter(Boolean) as string[]),
  )
  const { data: therapists } = therapistIds.length
    ? await supabase.from('users').select('id, full_name, avatar_url').in('id', therapistIds)
    : { data: [] }

  const therapistNamesById: Record<string, string> = Object.fromEntries(
    (therapists ?? []).map((t) => [t.id, t.full_name]),
  )

  // Subset para el widget de calendario — incluye todos los campos para el panel de detalle
  const calendarAppts: CalendarAppt[] = allMonthAppts.map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    ends_at: a.ends_at ?? null,
    child_id: a.child_id,
    service_type: a.service_type ?? null,
    event_type: a.event_type ?? null,
    therapist_name: a.therapist_id ? (therapistNamesById[a.therapist_id] ?? null) : null,
  }))

  return (
    <div className="space-y-6 md:space-y-0 md:flex md:gap-6 md:items-start">
      {/* Widget de calendario — sticky a la izquierda en desktop */}
      <div className="md:w-72 md:flex-shrink-0 md:sticky md:top-28">
        <PortalCalendarWidget
          appointments={calendarAppts}
          childNamesById={childNamesById}
        />
      </div>

      {/* Lista de próximas citas */}
      <div className="md:flex-1 md:min-w-0">
        <PortalAgendaList
          appointments={upcomingAppts}
          childrenList={children}
          therapists={
            (therapists ?? []) as { id: string; full_name: string; avatar_url: string | null }[]
          }
        />
      </div>
    </div>
  )
}
