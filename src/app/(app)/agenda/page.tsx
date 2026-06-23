import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { AgendaPageClient } from './AgendaPageClient'
import type { Appointment, Child, InstitutionalClosure, UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'supervisor',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'terapista',
  'maestra',
  'contable',
  'operator',
]

export default async function AgendaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const role = ctx.appUser.role
  if (!ALLOWED_ROLES.includes(role)) redirect('/dashboard')

  const supabase = await createClient()

  // Rango inicial: mes actual ± 1 mes (para week/month views).
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString()

  // Citas. RLS filtra: terapistas solo ven las suyas.
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .gte('starts_at', rangeStart)
    .lte('starts_at', rangeEnd)
    .order('starts_at')

  // Niños activos para autocomplete del modal (no críticos para la grid).
  // Activos = no en fases terminales (5.x).
  const { data: children } = await supabase
    .from('children')
    .select('id, code, full_name, family_id, current_phase_code')
    .not('current_phase_code', 'in', '(5_1_alta_terapeutica,5_2_retirado)')
    .order('full_name')

  // Terapistas para filtros y autocomplete. Incluye todos los roles que pueden dar
  // terapia (la dueña suele ser admin; las coordinadoras también atienden) UNIDO con
  // cualquier usuario que realmente aparezca como therapist_id en las citas cargadas,
  // para que nadie con citas quede fuera del filtro.
  const therapyRoles: UserRole[] = [
    'terapista',
    'maestra',
    'directora',
    'admin',
    'coordinadora_familias',
    'coordinadora_terapias',
  ]
  const apptTherapistIds = Array.from(
    new Set(((appointments ?? []) as Appointment[]).map((a) => a.therapist_id).filter(Boolean)),
  ) as string[]
  const therapistsQuery = supabase
    .from('users')
    .select('id, full_name, role, avatar_url')
  const { data: therapists } = await (apptTherapistIds.length
    ? therapistsQuery.or(
        `role.in.(${therapyRoles.join(',')}),id.in.(${apptTherapistIds.join(',')})`,
      )
    : therapistsQuery.in('role', therapyRoles)
  ).order('full_name')

  // Cierres institucionales del año visible.
  const { data: closures } = await supabase
    .from('institutional_calendar')
    .select('*')
    .order('date')

  return (
    <div className="flex flex-col h-screen bg-fm-background">
      <TopNav title="Agenda" />
      <div className="flex-1 overflow-hidden">
        <AgendaPageClient
          currentUserRole={role}
          currentUserId={ctx.appUser.id}
          initialAppointments={(appointments ?? []) as Appointment[]}
          childrenList={(children ?? []) as Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'current_phase_code'>[]}
          therapists={therapists ?? []}
          closures={(closures ?? []) as InstitutionalClosure[]}
        />
      </div>
    </div>
  )
}
