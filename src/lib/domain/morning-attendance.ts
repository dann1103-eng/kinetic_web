import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

/**
 * Asistencia de programas matutinos (grupos) para los dashboards del niño.
 *
 * La asistencia de grupo NO vive en `appointments` (los programas matutinos flat
 * no generan cita por-niño desde la mig 0149); vive en `program_session_attendance`
 * + `program_group_sessions`. Esta función pura convierte esas tablas en un
 * `{present, total}` por niño para sumarlo a la asistencia del mes.
 *
 * - `total` = sesiones del mes (no canceladas) de los grupos del niño que caen en
 *   sus días de asistencia (`attendance_days`). Incluye las futuras aún no
 *   realizadas (consistente con cómo cuentan las terapias individuales).
 * - `present` = filas de asistencia del niño con status `present` sobre esas
 *   sesiones.
 */

export interface GroupMembershipLite {
  child_id: string
  group_id: string
  /** Códigos 'mon'..'sun'. Vacío = asiste todos los días de sesión del grupo. */
  attendance_days: string[]
}

export interface GroupSessionLite {
  id: string
  group_id: string
  /** 'YYYY-MM-DD' (fecha local SV de la sesión). */
  session_date: string
  /** 'scheduled' | 'held' | 'cancelled'. */
  status: string
}

export interface AttendanceRowLite {
  child_id: string
  session_id: string
  /** 'present' | 'absent' | 'excused'. */
  status: string
}

const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Código de día ('mon'..'sun') de una fecha 'YYYY-MM-DD' (sin efectos de zona). */
function weekdayCode(sessionDate: string): string {
  const [y, m, d] = sessionDate.split('-').map(Number)
  return WEEKDAY_CODES[new Date(y, m - 1, d, 12, 0, 0).getDay()]
}

export function computeMorningAttendance(
  memberships: GroupMembershipLite[],
  sessions: GroupSessionLite[],
  attendance: AttendanceRowLite[],
): Map<string, { present: number; total: number }> {
  // Sesiones activas (no canceladas) por grupo.
  const sessionsByGroup = new Map<string, GroupSessionLite[]>()
  const activeSessionIds = new Set<string>()
  for (const s of sessions) {
    if (s.status === 'cancelled') continue
    activeSessionIds.add(s.id)
    const arr = sessionsByGroup.get(s.group_id) ?? []
    arr.push(s)
    sessionsByGroup.set(s.group_id, arr)
  }

  // Presentes por niño (solo sobre sesiones activas).
  const presentByChild = new Map<string, number>()
  for (const a of attendance) {
    if (a.status !== 'present') continue
    if (!activeSessionIds.has(a.session_id)) continue
    presentByChild.set(a.child_id, (presentByChild.get(a.child_id) ?? 0) + 1)
  }

  // Total por niño = sesiones aplicables (día ∈ attendance_days; vacío = todos).
  const totalByChild = new Map<string, number>()
  for (const m of memberships) {
    const groupSessions = sessionsByGroup.get(m.group_id) ?? []
    let count = 0
    for (const s of groupSessions) {
      if (m.attendance_days.length === 0 || m.attendance_days.includes(weekdayCode(s.session_date))) {
        count++
      }
    }
    totalByChild.set(m.child_id, (totalByChild.get(m.child_id) ?? 0) + count)
  }

  const result = new Map<string, { present: number; total: number }>()
  const childIds = new Set<string>([...totalByChild.keys(), ...presentByChild.keys()])
  for (const cid of childIds) {
    result.set(cid, {
      present: presentByChild.get(cid) ?? 0,
      total: totalByChild.get(cid) ?? 0,
    })
  }
  return result
}

/**
 * Sesión de grupo matutino "aplanada" por niño, para pintarla en calendarios
 * (panel del niño y portal de padres) como si fuera una cita más. El programa
 * (blue_kids/learning_kids/aula_educativa) es un ServiceType de primera clase,
 * así que las paletas/labels existentes la renderizan sin código nuevo.
 */
export interface MorningSessionCell {
  /** id de program_group_sessions (uuid — no colisiona con appointments). */
  id: string
  starts_at: string
  ends_at: string
  /** Programa como service_type. */
  service_type: string
  groupName: string
  /** Marca de asistencia del niño en esa sesión (null = sin marcar todavía). */
  attendance: 'present' | 'absent' | 'excused' | null
}

/**
 * Trae las sesiones de grupo (no canceladas) de los grupos de cada niño en la
 * ventana, filtradas a sus attendance_days, con su marca de asistencia.
 * Devuelve un mapa child_id → sesiones ordenadas por starts_at.
 */
export async function fetchMorningSessionCellsForChildren(
  supabase: SupabaseClient<Database>,
  childIds: string[],
  startISO: string,
  endISO: string,
): Promise<Map<string, MorningSessionCell[]>> {
  const result = new Map<string, MorningSessionCell[]>()
  if (childIds.length === 0) return result

  const { data: membersRaw } = await supabase
    .from('program_group_members')
    .select('child_id, group_id, attendance_days')
    .in('child_id', childIds)
    .eq('active', true)
  const memberships = (membersRaw ?? []) as GroupMembershipLite[]
  if (memberships.length === 0) return result

  const groupIds = Array.from(new Set(memberships.map((m) => m.group_id)))
  const [{ data: groupsRaw }, { data: sessionsRaw }] = await Promise.all([
    supabase.from('program_groups').select('id, name, program').in('id', groupIds),
    supabase
      .from('program_group_sessions')
      .select('id, group_id, session_date, starts_at, ends_at, status')
      .in('group_id', groupIds)
      .gte('starts_at', startISO)
      .lt('starts_at', endISO)
      .neq('status', 'cancelled')
      .order('starts_at'),
  ])
  const groupById = new Map(
    ((groupsRaw ?? []) as { id: string; name: string; program: string }[]).map((g) => [g.id, g]),
  )
  const sessions = (sessionsRaw ?? []) as {
    id: string
    group_id: string
    session_date: string
    starts_at: string
    ends_at: string
    status: string
  }[]

  const sessionIds = sessions.map((s) => s.id)
  const { data: attendanceRaw } = sessionIds.length
    ? await supabase
        .from('program_session_attendance')
        .select('child_id, session_id, status')
        .in('session_id', sessionIds)
        .in('child_id', childIds)
    : { data: [] as AttendanceRowLite[] }
  const markByKey = new Map<string, string>()
  for (const a of (attendanceRaw ?? []) as AttendanceRowLite[]) {
    markByKey.set(`${a.session_id}:${a.child_id}`, a.status)
  }

  const sessionsByGroup = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const arr = sessionsByGroup.get(s.group_id) ?? []
    arr.push(s)
    sessionsByGroup.set(s.group_id, arr)
  }

  for (const m of memberships) {
    const group = groupById.get(m.group_id)
    if (!group) continue
    const cells = result.get(m.child_id) ?? []
    for (const s of sessionsByGroup.get(m.group_id) ?? []) {
      if (m.attendance_days.length > 0 && !m.attendance_days.includes(weekdayCode(s.session_date))) {
        continue
      }
      cells.push({
        id: s.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        service_type: group.program,
        groupName: group.name,
        attendance: (markByKey.get(`${s.id}:${m.child_id}`) ?? null) as MorningSessionCell['attendance'],
      })
    }
    if (cells.length > 0) {
      cells.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      result.set(m.child_id, cells)
    }
  }

  return result
}

/**
 * Trae y computa la asistencia matutina de un conjunto de niños en una ventana
 * de tiempo. Envuelve `computeMorningAttendance` con las 3 queries necesarias.
 * Devuelve un mapa child_id → {present, total} (solo niños con membresía activa).
 */
export async function fetchMorningAttendanceByChild(
  supabase: SupabaseClient<Database>,
  childIds: string[],
  startISO: string,
  endISO: string,
): Promise<Map<string, { present: number; total: number }>> {
  if (childIds.length === 0) return new Map()

  const { data: membersRaw } = await supabase
    .from('program_group_members')
    .select('child_id, group_id, attendance_days')
    .in('child_id', childIds)
    .eq('active', true)
  const memberships = (membersRaw ?? []) as GroupMembershipLite[]
  if (memberships.length === 0) return new Map()

  const groupIds = Array.from(new Set(memberships.map((m) => m.group_id)))
  const { data: sessionsRaw } = await supabase
    .from('program_group_sessions')
    .select('id, group_id, session_date, status')
    .in('group_id', groupIds)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
  const sessions = (sessionsRaw ?? []) as GroupSessionLite[]

  const sessionIds = sessions.map((s) => s.id)
  const { data: attendanceRaw } = sessionIds.length
    ? await supabase
        .from('program_session_attendance')
        .select('child_id, session_id, status')
        .in('session_id', sessionIds)
        .in('child_id', childIds)
    : { data: [] as AttendanceRowLite[] }
  const attendance = (attendanceRaw ?? []) as AttendanceRowLite[]

  return computeMorningAttendance(memberships, sessions, attendance)
}
