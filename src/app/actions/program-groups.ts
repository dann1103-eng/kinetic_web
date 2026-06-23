'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  ProgramGroup,
  ProgramGroupMember,
  ProgramGroupSession,
  MorningProgram,
  ProgramAttendanceStatus,
} from '@/types/db'

// Roles que pueden gestionar grupos (espejo de kn_can_manage_groups en SQL).
const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
] as const

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function isMgmt(role: string): boolean {
  return (MGMT_ROLES as readonly string[]).includes(role)
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

export interface ProgramGroupWithStaff extends ProgramGroup {
  staff: { user_id: string; full_name: string; is_lead: boolean }[]
  member_count: number
}

export async function listGroups(
  program?: MorningProgram,
): Promise<ProgramGroupWithStaff[]> {
  const { supabase } = await getActor()
  let q = supabase.from('program_groups').select('*').order('program').order('name')
  if (program) q = q.eq('program', program)
  const { data: groups, error } = await q
  if (error) throw new Error(error.message)
  const list = (groups ?? []) as ProgramGroup[]
  if (list.length === 0) return []

  const ids = list.map((g) => g.id)
  const [{ data: staffRaw }, { data: membersRaw }] = await Promise.all([
    supabase.from('program_group_staff').select('group_id, user_id, is_lead').in('group_id', ids),
    supabase.from('program_group_members').select('group_id, active').in('group_id', ids).eq('active', true),
  ])
  const staffRows = (staffRaw ?? []) as { group_id: string; user_id: string; is_lead: boolean }[]
  const userIds = Array.from(new Set(staffRows.map((s) => s.user_id)))
  const { data: usersRaw } = userIds.length
    ? await supabase.from('users').select('id, full_name').in('id', userIds)
    : { data: [] }
  const nameById = new Map(
    ((usersRaw ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]),
  )
  const memberCount = new Map<string, number>()
  for (const m of (membersRaw ?? []) as { group_id: string }[]) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }

  return list.map((g) => ({
    ...g,
    staff: staffRows
      .filter((s) => s.group_id === g.id)
      .map((s) => ({ user_id: s.user_id, full_name: nameById.get(s.user_id) ?? '—', is_lead: s.is_lead })),
    member_count: memberCount.get(g.id) ?? 0,
  }))
}

export async function listGroupMembers(groupId: string): Promise<
  (ProgramGroupMember & { child_full_name: string })[]
> {
  const { supabase } = await getActor()
  const { data: membersRaw } = await supabase
    .from('program_group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('active', true)
  const members = (membersRaw ?? []) as ProgramGroupMember[]
  if (members.length === 0) return []
  const childIds = members.map((m) => m.child_id)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .in('id', childIds)
  const nameById = new Map(
    ((childrenRaw ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]),
  )
  return members.map((m) => ({ ...m, child_full_name: nameById.get(m.child_id) ?? '—' }))
}

/** Sesiones del grupo en un mes + maestra(s) asignada(s). Para el preview del ciclo. */
export async function getGroupMonthCalendar(
  groupId: string,
  periodMonth: string, // 'YYYY-MM' o 'YYYY-MM-01'
): Promise<{
  group: ProgramGroup | null
  staffNames: string[]
  sessions: ProgramGroupSession[]
}> {
  const { supabase } = await getActor()
  const ym = periodMonth.slice(0, 7)
  const first = `${ym}-01`
  const [y, m] = ym.split('-').map(Number)
  const nextFirst = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`

  const [{ data: group }, { data: staffRaw }, { data: sessionsRaw }] = await Promise.all([
    supabase.from('program_groups').select('*').eq('id', groupId).maybeSingle(),
    supabase.from('program_group_staff').select('user_id').eq('group_id', groupId),
    supabase
      .from('program_group_sessions')
      .select('*')
      .eq('group_id', groupId)
      .gte('session_date', first)
      .lt('session_date', nextFirst)
      .order('session_date'),
  ])
  const userIds = ((staffRaw ?? []) as { user_id: string }[]).map((s) => s.user_id)
  const { data: usersRaw } = userIds.length
    ? await supabase.from('users').select('id, full_name').in('id', userIds)
    : { data: [] }
  return {
    group: (group ?? null) as ProgramGroup | null,
    staffNames: ((usersRaw ?? []) as { full_name: string }[]).map((u) => u.full_name),
    sessions: (sessionsRaw ?? []) as ProgramGroupSession[],
  }
}

// ── Contexto del grupo para generar citas matutinas del ciclo ─────────────────

export interface MorningGroupContext {
  groupName: string
  program: MorningProgram
  start_time_local: string
  duration_minutes: number
  /** Maestra líder del grupo (therapist_id de las citas). */
  therapist_id: string | null
  therapist_name: string | null
  /** Feriados/cierres del mes ('YYYY-MM-DD', zona SV). */
  holidays: string[]
}

/** Horario + maestra + feriados de un grupo para un mes — alimenta la
 *  previsualización de citas matutinas en el modal del ciclo. */
export async function getMorningGroupContext(
  groupId: string,
  periodMonth: string,
): Promise<MorningGroupContext | null> {
  const { supabase } = await getActor()
  const { data: group } = await supabase
    .from('program_groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle()
  if (!group) return null
  const g = group as ProgramGroup

  const { data: staffRaw } = await supabase
    .from('program_group_staff')
    .select('user_id, is_lead')
    .eq('group_id', groupId)
  const staff = (staffRaw ?? []) as { user_id: string; is_lead: boolean }[]
  const lead = staff.find((s) => s.is_lead)?.user_id ?? staff[0]?.user_id ?? null

  let therapist_name: string | null = null
  if (lead) {
    const { data: u } = await supabase.from('users').select('full_name').eq('id', lead).maybeSingle()
    therapist_name = (u as { full_name: string } | null)?.full_name ?? null
  }

  const ym = periodMonth.slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const nextFirst = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
  const { data: hol } = await supabase
    .from('institutional_calendar')
    .select('date, type')
    .gte('date', `${ym}-01`)
    .lt('date', nextFirst)
    .in('type', ['holiday', 'closure', 'gov_decree', 'kinetic_break'])
  const holidays = ((hol ?? []) as { date: string }[]).map((h) => h.date)

  return {
    groupName: g.name,
    program: g.program,
    start_time_local: g.start_time_local,
    duration_minutes: g.duration_minutes,
    therapist_id: lead,
    therapist_name,
    holidays,
  }
}

// ── Gestión de grupos (admin client, gateado por rol) ──────────────────────────

export interface UpsertGroupInput {
  id?: string
  program: MorningProgram
  name: string
  meetingDays: string[]
  startTimeLocal: string
  durationMinutes: number
  active?: boolean
  staffUserIds: string[]
  leadUserId?: string | null
}

export async function upsertGroup(
  input: UpsertGroupInput,
): Promise<{ ok: true; group: ProgramGroup } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) return { ok: false, error: 'No autorizado.' }
  if (!input.name.trim()) return { ok: false, error: 'El nombre es obligatorio.' }
  if (input.meetingDays.length === 0) return { ok: false, error: 'Elegí al menos un día.' }
  if (!/^\d{2}:\d{2}$/.test(input.startTimeLocal)) return { ok: false, error: 'Hora inválida (HH:MM).' }

  const admin = createAdminClient()
  const payload = {
    program: input.program,
    name: input.name.trim(),
    meeting_days: input.meetingDays,
    start_time_local: input.startTimeLocal,
    duration_minutes: input.durationMinutes,
    active: input.active ?? true,
  }

  let groupId = input.id
  if (groupId) {
    const { error } = await admin.from('program_groups').update(payload).eq('id', groupId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data, error } = await admin.from('program_groups').insert(payload).select('id').single()
    if (error) return { ok: false, error: error.message }
    groupId = (data as { id: string }).id
  }

  // Reemplazar staff del grupo.
  await admin.from('program_group_staff').delete().eq('group_id', groupId)
  if (input.staffUserIds.length > 0) {
    const rows = input.staffUserIds.map((uid) => ({
      group_id: groupId!,
      user_id: uid,
      is_lead: uid === input.leadUserId,
    }))
    const { error: staffErr } = await admin.from('program_group_staff').insert(rows)
    if (staffErr) return { ok: false, error: staffErr.message }
  }

  const { data: group } = await admin.from('program_groups').select('*').eq('id', groupId).single()
  revalidatePath('/operacion/grupos')
  return { ok: true, group: group as ProgramGroup }
}

export async function setGroupMemberDays(
  groupId: string,
  childId: string,
  attendanceDays: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) return { ok: false, error: 'No autorizado.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('program_group_members')
    .update({ attendance_days: attendanceDays })
    .eq('group_id', groupId)
    .eq('child_id', childId)
    .eq('active', true)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/grupos')
  return { ok: true }
}

export async function removeGroupMember(
  groupId: string,
  childId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!isMgmt(user.role)) return { ok: false, error: 'No autorizado.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('program_group_members')
    .update({ active: false })
    .eq('group_id', groupId)
    .eq('child_id', childId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/operacion/grupos')
  return { ok: true }
}

export async function generateGroupSessionsForMonth(
  groupId: string,
  periodMonth: string, // 'YYYY-MM' o 'YYYY-MM-01'
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) return { ok: false, error: 'No autorizado.' }
  const first = `${periodMonth.slice(0, 7)}-01`
  const { data, error } = await supabase.rpc('generate_group_sessions_for_month', {
    p_group_id: groupId,
    p_month: first,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('group_not_found')) return { ok: false, error: 'Grupo no encontrado.' }
    return { ok: false, error: msg || 'Error al generar sesiones.' }
  }
  revalidatePath('/operacion/grupos')
  revalidatePath('/mi-dia')
  revalidatePath('/agenda')
  return { ok: true, created: (data as number) ?? 0 }
}

// ── Asistencia (lista del día) ─────────────────────────────────────────────────

const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export interface RosterEntry {
  child_id: string
  child_full_name: string
  status: ProgramAttendanceStatus | null // null = aún no marcado
  note: string | null
}

/** Roster de una sesión: miembros activos cuyos días incluyen el día de la sesión. */
export async function getSessionRoster(
  sessionId: string,
): Promise<
  | { ok: true; session: ProgramGroupSession; groupName: string; roster: RosterEntry[] }
  | { ok: false; error: string }
> {
  const { supabase } = await getActor()
  const { data: session } = await supabase
    .from('program_group_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Sesión no encontrada.' }
  const s = session as ProgramGroupSession

  const dow = DOW_NAMES[new Date(`${s.session_date}T12:00:00`).getDay()]

  const [{ data: group }, { data: membersRaw }, { data: attendanceRaw }] = await Promise.all([
    supabase.from('program_groups').select('name').eq('id', s.group_id).maybeSingle(),
    supabase
      .from('program_group_members')
      .select('child_id, attendance_days')
      .eq('group_id', s.group_id)
      .eq('active', true),
    supabase
      .from('program_session_attendance')
      .select('child_id, status, note')
      .eq('session_id', sessionId),
  ])

  const members = ((membersRaw ?? []) as { child_id: string; attendance_days: string[] }[])
    .filter((m) => (m.attendance_days ?? []).includes(dow))
  if (members.length === 0) {
    return {
      ok: true,
      session: s,
      groupName: (group as { name: string } | null)?.name ?? '—',
      roster: [],
    }
  }

  const childIds = members.map((m) => m.child_id)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .in('id', childIds)
  const nameById = new Map(
    ((childrenRaw ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]),
  )
  const attById = new Map(
    ((attendanceRaw ?? []) as { child_id: string; status: ProgramAttendanceStatus; note: string | null }[]).map(
      (a) => [a.child_id, a],
    ),
  )

  const roster: RosterEntry[] = members
    .map((m) => ({
      child_id: m.child_id,
      child_full_name: nameById.get(m.child_id) ?? '—',
      status: attById.get(m.child_id)?.status ?? null,
      note: attById.get(m.child_id)?.note ?? null,
    }))
    .sort((a, b) => a.child_full_name.localeCompare(b.child_full_name, 'es'))

  return {
    ok: true,
    session: s,
    groupName: (group as { name: string } | null)?.name ?? '—',
    roster,
  }
}

export interface AttendanceMark {
  childId: string
  status: ProgramAttendanceStatus
  note?: string | null
}

export async function markSessionAttendance(
  sessionId: string,
  entries: AttendanceMark[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  // El usuario debe ser staff del grupo de la sesión o gestión.
  const { data: session } = await supabase
    .from('program_group_sessions')
    .select('id, group_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Sesión no encontrada.' }
  const groupId = (session as { group_id: string }).group_id

  if (!isMgmt(user.role)) {
    const { data: staff } = await supabase
      .from('program_group_staff')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!staff) return { ok: false, error: 'No sos parte del staff de este grupo.' }
  }

  const rows = entries.map((e) => ({
    session_id: sessionId,
    child_id: e.childId,
    status: e.status,
    note: e.note ?? null,
    marked_by_user_id: user.id,
    marked_at: new Date().toISOString(),
  }))
  // upsert por (session_id, child_id)
  const { error } = await supabase
    .from('program_session_attendance')
    .upsert(rows, { onConflict: 'session_id,child_id' })
  if (error) return { ok: false, error: error.message }

  // Marcar la sesión como realizada.
  await supabase.from('program_group_sessions').update({ status: 'held' }).eq('id', sessionId)

  revalidatePath('/mi-dia')
  return { ok: true }
}
