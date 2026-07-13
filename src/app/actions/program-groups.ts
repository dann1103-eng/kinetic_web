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
import {
  computeMorningAttendance,
  type GroupMembershipLite,
  type GroupSessionLite,
  type AttendanceRowLite,
} from '@/lib/domain/morning-attendance'

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
  staff: { user_id: string; full_name: string; is_lead: boolean; avatar_url: string | null }[]
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
    ? await supabase.from('users').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [] }
  const userById = new Map(
    ((usersRaw ?? []) as { id: string; full_name: string; avatar_url: string | null }[]).map((u) => [u.id, u]),
  )
  const memberCount = new Map<string, number>()
  for (const m of (membersRaw ?? []) as { group_id: string }[]) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }

  return list.map((g) => ({
    ...g,
    staff: staffRows
      .filter((s) => s.group_id === g.id)
      .map((s) => ({
        user_id: s.user_id,
        full_name: userById.get(s.user_id)?.full_name ?? '—',
        avatar_url: userById.get(s.user_id)?.avatar_url ?? null,
        is_lead: s.is_lead,
      })),
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

/** 'YYYY-MM' del mes en curso en zona SV. */
function currentMonthYm(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export interface GroupMemberWithAttendance extends ProgramGroupMember {
  child_full_name: string
  /** Asistencia del mes en curso. */
  monthPresent: number
  monthTotal: number
  /** Asistencia histórica (desde que entró al grupo). */
  allPresent: number
  allTotal: number
}

/**
 * Miembros activos del grupo + su asistencia del mes en curso y acumulada.
 * Reusa la matemática pura computeMorningAttendance (respeta attendance_days).
 */
export async function listGroupMembersWithAttendance(
  groupId: string,
): Promise<GroupMemberWithAttendance[]> {
  const { supabase } = await getActor()
  const { data: membersRaw } = await supabase
    .from('program_group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('active', true)
  const members = (membersRaw ?? []) as ProgramGroupMember[]
  if (members.length === 0) return []
  const childIds = members.map((m) => m.child_id)

  const [{ data: childrenRaw }, { data: sessionsRaw }] = await Promise.all([
    supabase.from('children').select('id, full_name').in('id', childIds),
    supabase
      .from('program_group_sessions')
      .select('id, group_id, session_date, status')
      .eq('group_id', groupId)
      .neq('status', 'cancelled')
      .order('session_date'),
  ])
  const nameById = new Map(
    ((childrenRaw ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]),
  )
  const allSessions = (sessionsRaw ?? []) as GroupSessionLite[]
  const ym = currentMonthYm()
  const monthSessions = allSessions.filter((s) => s.session_date.startsWith(`${ym}-`))

  const sessionIds = allSessions.map((s) => s.id)
  const { data: attendanceRaw } = sessionIds.length
    ? await supabase
        .from('program_session_attendance')
        .select('child_id, session_id, status')
        .in('session_id', sessionIds)
        .in('child_id', childIds)
    : { data: [] as AttendanceRowLite[] }
  const attendance = (attendanceRaw ?? []) as AttendanceRowLite[]

  const memberships: GroupMembershipLite[] = members.map((m) => ({
    child_id: m.child_id,
    group_id: groupId,
    attendance_days: m.attendance_days,
  }))
  const allMap = computeMorningAttendance(memberships, allSessions, attendance)
  const monthMap = computeMorningAttendance(memberships, monthSessions, attendance)

  return members.map((m) => {
    const month = monthMap.get(m.child_id) ?? { present: 0, total: 0 }
    const all = allMap.get(m.child_id) ?? { present: 0, total: 0 }
    return {
      ...m,
      child_full_name: nameById.get(m.child_id) ?? '—',
      monthPresent: month.present,
      monthTotal: month.total,
      allPresent: all.present,
      allTotal: all.total,
    }
  })
}

// ── Histórico de asistencias del grupo ───────────────────────────────────────

export interface GroupHistorySessionMark {
  childId: string
  childName: string
  status: ProgramAttendanceStatus | 'unmarked'
}
export interface GroupHistorySession {
  sessionId: string
  date: string // 'YYYY-MM-DD'
  status: string // scheduled|held|cancelled
  present: number
  absent: number
  excused: number
  marks: GroupHistorySessionMark[]
}
export interface GroupHistoryChildMonth {
  month: string // 'YYYY-MM'
  present: number
  total: number
}
export interface GroupHistoryChild {
  childId: string
  childName: string
  months: GroupHistoryChildMonth[]
}
export interface GroupAttendanceHistory {
  bySession: GroupHistorySession[]
  byChild: GroupHistoryChild[]
}

/**
 * Histórico de asistencias de un grupo en los últimos `monthsBack` meses:
 *  - bySession: cada sesión con su detalle niño-por-niño.
 *  - byChild: cada niño con su asistencia por mes.
 */
export async function getGroupAttendanceHistory(
  groupId: string,
  monthsBack = 3,
): Promise<GroupAttendanceHistory> {
  const { supabase } = await getActor()

  // Ventana: primer día de (mes actual − monthsBack).
  const now = new Date()
  const sv = new Date(now.getTime() - 6 * 3600 * 1000)
  const fromY = sv.getUTCFullYear()
  const fromM = sv.getUTCMonth() - monthsBack
  const fromDate = new Date(Date.UTC(fromY, fromM, 1))
  const fromStr = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [{ data: membersRaw }, { data: sessionsRaw }] = await Promise.all([
    supabase.from('program_group_members').select('child_id, attendance_days').eq('group_id', groupId).eq('active', true),
    supabase
      .from('program_group_sessions')
      .select('id, group_id, session_date, status')
      .eq('group_id', groupId)
      .neq('status', 'cancelled')
      .gte('session_date', fromStr)
      .order('session_date', { ascending: false }),
  ])
  const members = (membersRaw ?? []) as { child_id: string; attendance_days: string[] }[]
  const sessions = (sessionsRaw ?? []) as GroupSessionLite[]
  const childIds = members.map((m) => m.child_id)

  const { data: childrenRaw } = childIds.length
    ? await supabase.from('children').select('id, full_name').in('id', childIds)
    : { data: [] as { id: string; full_name: string }[] }
  const nameById = new Map(
    ((childrenRaw ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]),
  )

  const sessionIds = sessions.map((s) => s.id)
  const { data: attendanceRaw } = sessionIds.length
    ? await supabase
        .from('program_session_attendance')
        .select('child_id, session_id, status')
        .in('session_id', sessionIds)
    : { data: [] as { child_id: string; session_id: string; status: ProgramAttendanceStatus }[] }
  const attendance = (attendanceRaw ?? []) as { child_id: string; session_id: string; status: ProgramAttendanceStatus }[]
  // Índice status por (session, child).
  const markByKey = new Map<string, ProgramAttendanceStatus>()
  for (const a of attendance) markByKey.set(`${a.session_id}:${a.child_id}`, a.status)

  const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const weekdayOf = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number)
    return WEEKDAY[new Date(y, m - 1, dd, 12).getDay()]
  }

  // bySession: cada sesión con marcas de los niños que le tocaban ese día.
  const bySession: GroupHistorySession[] = sessions.map((s) => {
    const wd = weekdayOf(s.session_date)
    const applicable = members.filter(
      (m) => m.attendance_days.length === 0 || m.attendance_days.includes(wd),
    )
    let present = 0, absent = 0, excused = 0
    const marks: GroupHistorySessionMark[] = applicable.map((m) => {
      const st = markByKey.get(`${s.id}:${m.child_id}`) ?? 'unmarked'
      if (st === 'present') present++
      else if (st === 'absent') absent++
      else if (st === 'excused') excused++
      return { childId: m.child_id, childName: nameById.get(m.child_id) ?? '—', status: st }
    })
    return { sessionId: s.id, date: s.session_date, status: s.status, present, absent, excused, marks }
  })

  // byChild: asistencia por mes de cada niño.
  const byChild: GroupHistoryChild[] = members.map((m) => {
    const monthAgg = new Map<string, { present: number; total: number }>()
    for (const s of sessions) {
      const wd = weekdayOf(s.session_date)
      if (m.attendance_days.length > 0 && !m.attendance_days.includes(wd)) continue
      const mo = s.session_date.slice(0, 7)
      const agg = monthAgg.get(mo) ?? { present: 0, total: 0 }
      agg.total++
      if (markByKey.get(`${s.id}:${m.child_id}`) === 'present') agg.present++
      monthAgg.set(mo, agg)
    }
    const months = Array.from(monthAgg.entries())
      .map(([month, v]) => ({ month, present: v.present, total: v.total }))
      .sort((a, b) => b.month.localeCompare(a.month))
    return { childId: m.child_id, childName: nameById.get(m.child_id) ?? '—', months }
  })

  return { bySession, byChild }
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

/**
 * Asegura (idempotente) las sesiones del mes en curso y el siguiente para TODOS
 * los grupos activos. Se llama al abrir /operacion/grupos — así las misses nunca
 * tienen que generarlas a mano (reemplaza el botón "Generar sesiones del mes").
 * Best-effort: los errores no rompen la carga de la página.
 */
export async function ensureCurrentGroupSessions(): Promise<void> {
  const { supabase, user } = await getActor()
  if (!isMgmt(user.role)) return
  const { data: groups } = await supabase
    .from('program_groups')
    .select('id')
    .eq('active', true)
  const ids = ((groups ?? []) as { id: string }[]).map((g) => g.id)
  if (ids.length === 0) return

  const ym = currentMonthYm()
  const [y, m] = ym.split('-').map(Number)
  const nextYm = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`
  const months = [`${ym}-01`, `${nextYm}-01`]

  for (const gid of ids) {
    for (const month of months) {
      await supabase
        .rpc('generate_group_sessions_for_month', { p_group_id: gid, p_month: month })
        .then(({ error }) => {
          if (error) console.error('[ensureCurrentGroupSessions]', gid, month, error.message)
        })
    }
  }
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

export interface RosterEntry {
  child_id: string
  child_full_name: string
  status: ProgramAttendanceStatus | null // null = aún no marcado
  note: string | null
  /** Días/semana que le corresponden al niño (largo de attendance_days). null = sin cupo definido. */
  weekly_quota: number | null
  /** Veces marcado "presente" esta semana (lun–dom) en este grupo, incluida la sesión actual si ya se marcó. */
  weekly_used: number
}

/**
 * Roster de una sesión. Muestra a TODOS los niños activos del grupo (ya no solo
 * aquellos cuyos días asignados incluyen el día de la sesión). Así un niño de
 * "2 días por semana" aparece todos los días y la miss puede marcarle asistencia
 * el día que realmente llegue (p. ej. cuando repone una falta otro día). Cada
 * entrada trae un contador semanal `weekly_used / weekly_quota` (presentes esta
 * semana vs. días/semana del niño) para llevar la cuenta de cuántas de sus
 * visitas de la semana ya usó, sin importar el día.
 */
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

  // Lunes–domingo de la semana de la sesión (para el contador semanal).
  const base = new Date(`${s.session_date}T12:00:00`)
  const daysFromMonday = (base.getDay() + 6) % 7
  const monday = new Date(base)
  monday.setDate(base.getDate() - daysFromMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekStart = fmtDate(monday)
  const weekEnd = fmtDate(sunday)

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

  // TODOS los miembros activos del grupo (sin filtrar por día asignado).
  const members = (membersRaw ?? []) as { child_id: string; attendance_days: string[] | null }[]
  if (members.length === 0) {
    return {
      ok: true,
      session: s,
      groupName: (group as { name: string } | null)?.name ?? '—',
      roster: [],
    }
  }

  // Contador semanal: cuántas veces cada niño estuvo "presente" en las sesiones
  // de esta semana de este grupo (incluye la sesión de hoy si ya se marcó).
  const { data: weekSessionsRaw } = await supabase
    .from('program_group_sessions')
    .select('id')
    .eq('group_id', s.group_id)
    .gte('session_date', weekStart)
    .lte('session_date', weekEnd)
  const weekSessionIds = ((weekSessionsRaw ?? []) as { id: string }[]).map((r) => r.id)
  const { data: weekAttRaw } = weekSessionIds.length
    ? await supabase
        .from('program_session_attendance')
        .select('child_id')
        .in('session_id', weekSessionIds)
        .eq('status', 'present')
    : { data: [] as { child_id: string }[] }
  const usedByChild = new Map<string, number>()
  for (const a of (weekAttRaw ?? []) as { child_id: string }[]) {
    usedByChild.set(a.child_id, (usedByChild.get(a.child_id) ?? 0) + 1)
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
    .map((m) => {
      const quota = (m.attendance_days ?? []).length
      return {
        child_id: m.child_id,
        child_full_name: nameById.get(m.child_id) ?? '—',
        status: attById.get(m.child_id)?.status ?? null,
        note: attById.get(m.child_id)?.note ?? null,
        weekly_quota: quota > 0 ? quota : null,
        weekly_used: usedByChild.get(m.child_id) ?? 0,
      }
    })
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
