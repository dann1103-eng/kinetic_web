import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { AgendaPageClient, type GroupSessionForClient } from './AgendaPageClient'
import type { EvalCatalogItem } from '@/components/agenda/AppointmentForm'
import type { Appointment, Child, InstitutionalClosure, MorningProgram, UserRole } from '@/types/db'

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

  // Sesiones de grupo matutino en el rango → se muestran como bloques de GRUPO
  // (no como citas individuales por niño).
  const { data: groupSessionsRaw } = await supabase
    .from('program_group_sessions')
    .select('id, group_id, starts_at, ends_at, status, program_groups(name, program)')
    .gte('starts_at', rangeStart)
    .lte('starts_at', rangeEnd)
    .order('starts_at')

  type GSRow = {
    id: string
    group_id: string
    starts_at: string
    ends_at: string
    status: string
    program_groups:
      | { name: string; program: MorningProgram }
      | { name: string; program: MorningProgram }[]
      | null
  }
  const gsRows = (groupSessionsRaw ?? []) as unknown as GSRow[]

  // Staff por grupo (nombres para mostrar + ids para filtrar por terapista).
  const groupIds = Array.from(new Set(gsRows.map((s) => s.group_id)))
  const idsByGroup = new Map<string, string[]>()
  const namesByGroup = new Map<string, string[]>()
  if (groupIds.length > 0) {
    const { data: staffRows } = await supabase
      .from('program_group_staff')
      .select('group_id, user_id')
      .in('group_id', groupIds)
    const staffList = (staffRows ?? []) as { group_id: string; user_id: string }[]
    const staffUserIds = Array.from(new Set(staffList.map((r) => r.user_id)))
    const { data: staffUsersRaw } = staffUserIds.length
      ? await supabase.from('users').select('id, full_name').in('id', staffUserIds)
      : { data: [] as { id: string; full_name: string }[] }
    const nameById = new Map(
      ((staffUsersRaw ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]),
    )
    for (const r of staffList) {
      const ids = idsByGroup.get(r.group_id) ?? []
      ids.push(r.user_id)
      idsByGroup.set(r.group_id, ids)
      const nm = nameById.get(r.user_id)
      if (nm) {
        const names = namesByGroup.get(r.group_id) ?? []
        names.push(nm)
        namesByGroup.set(r.group_id, names)
      }
    }
  }

  const groupSessions: GroupSessionForClient[] = gsRows.map((s) => {
    const g = Array.isArray(s.program_groups) ? s.program_groups[0] : s.program_groups
    return {
      id: s.id,
      groupName: g?.name ?? 'Grupo',
      program: (g?.program ?? 'blue_kids') as MorningProgram,
      staffNames: namesByGroup.get(s.group_id) ?? [],
      staffUserIds: idsByGroup.get(s.group_id) ?? [],
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
    }
  })

  // Catálogo de evaluaciones (tipo + pago) para el selector al agendar evaluaciones.
  const { data: evalCatalog } = await supabase
    .from('service_catalog')
    .select('code, name, cost_usd, duration_minutes')
    .in('category', ['evaluacion', 'evaluacion_dx_tea', 'evaluacion_psicologica'])
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  return (
    <div className="flex flex-col h-screen bg-fm-background">
      <TopNav title="Agenda" />
      <div className="flex-1 overflow-hidden">
        <AgendaPageClient
          currentUserRole={role}
          currentUserId={ctx.appUser.id}
          initialAppointments={(appointments ?? []) as Appointment[]}
          groupSessions={groupSessions}
          childrenList={(children ?? []) as Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'current_phase_code'>[]}
          therapists={therapists ?? []}
          closures={(closures ?? []) as InstitutionalClosure[]}
          evalCatalog={(evalCatalog ?? []) as EvalCatalogItem[]}
        />
      </div>
    </div>
  )
}
