import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { AgendaPageClient } from './AgendaPageClient'
import type { Appointment, Child, InstitutionalClosure, UserRole, MorningProgram } from '@/types/db'

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

  // Sesiones de grupo del rango visible. Para terapistas/maestras: solo sus grupos.
  // Join manual (el SDK no resuelve FKs de tablas nuevas sin regenerar tipos).
  type SessionRaw = { id: string; group_id: string; starts_at: string; ends_at: string; status: string }
  let sessionRows: SessionRaw[] = []
  const isTherapistOrMaestra = role === 'terapista' || role === 'maestra'

  if (isTherapistOrMaestra) {
    const { data: staffGroups } = await supabase
      .from('program_group_staff')
      .select('group_id')
      .eq('user_id', ctx.appUser.id)
    const myGroupIds = (staffGroups ?? []).map((g) => g.group_id as string)
    if (myGroupIds.length > 0) {
      const { data: sessRaw } = await supabase
        .from('program_group_sessions')
        .select('id, group_id, starts_at, ends_at, status')
        .in('group_id', myGroupIds)
        .gte('starts_at', rangeStart)
        .lte('starts_at', rangeEnd)
        .neq('status', 'cancelled')
        .order('starts_at')
      sessionRows = (sessRaw ?? []) as SessionRaw[]
    }
  } else {
    const { data: sessRaw } = await supabase
      .from('program_group_sessions')
      .select('id, group_id, starts_at, ends_at, status')
      .gte('starts_at', rangeStart)
      .lte('starts_at', rangeEnd)
      .neq('status', 'cancelled')
      .order('starts_at')
    sessionRows = (sessRaw ?? []) as SessionRaw[]
  }

  // Cargar grupos y staff en paralelo.
  const uniqueGroupIds = Array.from(new Set(sessionRows.map((s) => s.group_id)))
  const groupInfoById = new Map<string, { name: string; program: MorningProgram }>()
  const staffByGroup = new Map<string, string[]>()

  if (uniqueGroupIds.length > 0) {
    const [{ data: grpRaw }, { data: staffRaw }] = await Promise.all([
      supabase.from('program_groups').select('id, name, program').in('id', uniqueGroupIds),
      supabase.from('program_group_staff').select('group_id, user_id').in('group_id', uniqueGroupIds),
    ])
    for (const g of (grpRaw ?? []) as { id: string; name: string; program: MorningProgram }[]) {
      groupInfoById.set(g.id, { name: g.name, program: g.program })
    }
    const staffUserIds = Array.from(new Set((staffRaw ?? []).map((s) => s.user_id as string)))
    const { data: usersRaw } = staffUserIds.length
      ? await supabase.from('users').select('id, full_name').in('id', staffUserIds)
      : { data: [] }
    const nameById = new Map(((usersRaw ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]))
    for (const s of (staffRaw ?? []) as { group_id: string; user_id: string }[]) {
      const list = staffByGroup.get(s.group_id) ?? []
      const name = nameById.get(s.user_id)
      if (name) list.push(name)
      staffByGroup.set(s.group_id, list)
    }
  }

  type GroupSessionForClient = {
    id: string
    groupName: string
    program: MorningProgram
    staffNames: string[]
    starts_at: string
    ends_at: string
    status: string
  }
  const groupSessionsForClient: GroupSessionForClient[] = sessionRows.map((s) => {
    const info = groupInfoById.get(s.group_id)
    return {
      id: s.id,
      groupName: info?.name ?? 'Grupo',
      program: info?.program ?? 'blue_kids',
      staffNames: staffByGroup.get(s.group_id) ?? [],
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
    }
  })

  return (
    <div className="flex flex-col h-screen bg-fm-background">
      <TopNav title="Agenda" />
      <div className="flex-1 overflow-hidden">
        <AgendaPageClient
          currentUserRole={role}
          currentUserId={ctx.appUser.id}
          initialAppointments={(appointments ?? []) as Appointment[]}
          groupSessions={groupSessionsForClient}
          childrenList={(children ?? []) as Pick<Child, 'id' | 'code' | 'full_name' | 'family_id' | 'current_phase_code'>[]}
          therapists={therapists ?? []}
          closures={(closures ?? []) as InstitutionalClosure[]}
        />
      </div>
    </div>
  )
}
