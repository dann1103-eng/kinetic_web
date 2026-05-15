import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { PortalAgendaList } from './PortalAgendaList'
import type { Appointment, Child } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PortalAgendaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Niños que el padre puede ver (vía RLS de family_users → children)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, code, full_name, family_id, treatment_status')
    .order('full_name')

  const children = (childrenRaw ?? []) as Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'treatment_status'>[]

  // Próximas citas (RLS deja ver solo las del/los niño/s del padre)
  const todayIso = new Date()
  todayIso.setHours(0, 0, 0, 0)

  const { data: appointmentsRaw } = await supabase
    .from('appointments')
    .select('*')
    .gte('starts_at', todayIso.toISOString())
    .in('status', ['scheduled', 'in_progress', 'replacement'])
    .order('starts_at')

  const appointments = (appointmentsRaw ?? []) as Appointment[]

  // Lista de terapistas mencionados (para mostrar nombres legibles)
  const therapistIds = Array.from(new Set(appointments.map((a) => a.therapist_id).filter(Boolean) as string[]))
  const { data: therapists } = therapistIds.length
    ? await supabase.from('users').select('id, full_name, avatar_url').in('id', therapistIds)
    : { data: [] }

  return (
    <PortalAgendaList
      appointments={appointments}
      childrenList={children}
      therapists={(therapists ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
    />
  )
}
