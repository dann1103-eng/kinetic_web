import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  calculateWeeklyOccupancy,
  startOfWeekMonday,
  endOfWeekSunday,
  type TherapistLite,
  type AppointmentLite,
  type GroupSessionLite,
} from '@/lib/domain/therapist-capacity'
import type { TherapistWorkScheduleBlock } from '@/types/db'
import { TherapistCapacityTable } from '@/components/operacion/TherapistCapacityTable'
import { WeekNavigator } from '@/components/operacion/WeekNavigator'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'directora', 'coordinadora_terapias', 'recepcion']

interface PageProps {
  searchParams: Promise<{ week?: string }>
}

function parseWeekParam(s?: string): Date {
  if (!s) return new Date()
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d, 12, 0, 0)
}

function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default async function CapacidadTerapistasPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const weekStart = startOfWeekMonday(parseWeekParam(params.week))
  const weekEnd = endOfWeekSunday(weekStart)

  const supabase = await createClient()

  // Terapistas activos
  const { data: therapistsRaw } = await supabase
    .from('users')
    .select('id, full_name, max_hours_per_week, role')
    .in('role', ['terapista', 'maestra'])
    .order('full_name')

  const therapists: TherapistLite[] = (therapistsRaw ?? []).map((t) => ({
    id: t.id as string,
    full_name: t.full_name as string,
    max_hours_per_week: (t.max_hours_per_week ?? null) as number | null,
  }))

  // Horarios laborales
  const therapistIds = therapists.map((t) => t.id)
  const { data: schedulesRaw } = therapistIds.length
    ? await supabase
        .from('therapist_work_schedule')
        .select('*')
        .in('therapist_id', therapistIds)
        .eq('active', true)
    : { data: [] as TherapistWorkScheduleBlock[] }

  // Citas de la semana (TODOS los tipos de evento menos programa_matutino por-niño;
  // ese se cuenta por bloque de grupo abajo). No filtramos por therapist_id porque
  // los eventos multi-persona cuentan también para quien está en assignee_ids.
  const { data: apptsRaw } = therapistIds.length
    ? await supabase
        .from('appointments')
        .select('therapist_id, assignee_ids, event_type, starts_at, ends_at, status')
        .gte('starts_at', weekStart.toISOString())
        .lt('starts_at', new Date(weekEnd.getTime() + 1).toISOString())
        .neq('event_type', 'programa_matutino')
    : { data: [] as AppointmentLite[] }

  // Staff de grupos matutinos → qué user da qué grupo.
  const { data: staffRaw } = therapistIds.length
    ? await supabase.from('program_group_staff').select('group_id, user_id')
    : { data: [] as { group_id: string; user_id: string }[] }
  const staffByGroup = new Map<string, string[]>()
  for (const s of (staffRaw ?? []) as { group_id: string; user_id: string }[]) {
    const arr = staffByGroup.get(s.group_id) ?? []
    arr.push(s.user_id)
    staffByGroup.set(s.group_id, arr)
  }

  // Sesiones de grupo de la semana → un bloque de ocupación por sesión.
  const { data: sessionsRaw } = therapistIds.length
    ? await supabase
        .from('program_group_sessions')
        .select('group_id, starts_at, ends_at, status')
        .gte('starts_at', weekStart.toISOString())
        .lt('starts_at', new Date(weekEnd.getTime() + 1).toISOString())
    : { data: [] as { group_id: string; starts_at: string; ends_at: string; status: string }[] }
  const groupSessions: GroupSessionLite[] = (
    (sessionsRaw ?? []) as { group_id: string; starts_at: string; ends_at: string; status: string }[]
  ).map((s) => ({
    staffUserIds: staffByGroup.get(s.group_id) ?? [],
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: s.status,
  }))

  const rows = calculateWeeklyOccupancy(
    therapists,
    (schedulesRaw ?? []) as TherapistWorkScheduleBlock[],
    (apptsRaw ?? []) as AppointmentLite[],
    groupSessions,
    weekStart,
  )

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Operación
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
          Capacidad de terapistas
        </h1>
        <p className="text-sm text-fm-on-surface-variant max-w-prose">
          Horas agendadas vs horario contractual por semana. Verde &lt; 60%, amarillo 60-85%, rojo &gt; 85%.
        </p>
      </header>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <WeekNavigator weekStartParam={toDateParam(weekStart)} />
        <div className="flex items-center gap-4">
          <Link
            href="/operacion/capacidad-terapistas/completadas"
            className="inline-flex items-center gap-1 text-sm font-semibold text-fm-primary hover:underline"
          >
            <span className="material-symbols-outlined text-[18px]">task_alt</span>
            Ver horas completadas →
          </Link>
          <Link
            href="/operacion/horarios-terapistas"
            className="text-sm font-semibold text-fm-primary hover:underline"
          >
            Configurar horarios →
          </Link>
        </div>
      </div>

      <TherapistCapacityTable rows={rows} weekStartIso={toDateParam(weekStart)} />

      {therapists.length > 0 && rows.every((r) => r.totalScheduledMinutes === 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ningún terapista tiene horario laboral configurado. Andá a{' '}
          <Link
            href="/operacion/horarios-terapistas"
            className="font-semibold underline"
          >
            Configurar horarios
          </Link>{' '}
          para empezar.
        </div>
      )}
    </div>
  )
}
