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

  // Subset ligero para el widget de calendario
  const calendarAppts: CalendarAppt[] = allMonthAppts.map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    child_id: a.child_id,
  }))

  // Terapistas mencionados (para labels en la lista)
  const therapistIds = Array.from(
    new Set(upcomingAppts.map((a) => a.therapist_id).filter(Boolean) as string[]),
  )
  const { data: therapists } = therapistIds.length
    ? await supabase.from('users').select('id, full_name, avatar_url').in('id', therapistIds)
    : { data: [] }

  return (
    <div className="space-y-6">
      {/* Widget de calendario mensual */}
      <PortalCalendarWidget
        appointments={calendarAppts}
        childNamesById={childNamesById}
      />

      {/* Lista de próximas citas */}
      <PortalAgendaList
        appointments={upcomingAppts}
        childrenList={children}
        therapists={
          (therapists ?? []) as { id: string; full_name: string; avatar_url: string | null }[]
        }
      />
    </div>
  )
}
