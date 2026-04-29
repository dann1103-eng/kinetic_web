import { createClient } from '@/lib/supabase/server'
import { formatDuration } from '@/lib/domain/time'
import type { WorkSession, WorkSessionBreak } from '@/types/db'

const MS_PER_DAY = 1000 * 60 * 60 * 24

interface UserMini {
  id: string
  full_name: string
}

function dateKey(iso: string): string {
  return iso.slice(0, 10)
}

function calcOnlineSeconds(s: WorkSession): number {
  if (s.total_seconds != null) return s.total_seconds
  // Sesión aún abierta
  const now = new Date()
  const elapsed = Math.max(0, Math.round((now.getTime() - new Date(s.started_at).getTime()) / 1000))
  const breaks = (s.breaks_json ?? []) as WorkSessionBreak[]
  const breaksSec = breaks.reduce((sum, b) => {
    const end = b.ended_at ? new Date(b.ended_at) : now
    return sum + Math.round((end.getTime() - new Date(b.started_at).getTime()) / 1000)
  }, 0)
  return Math.max(0, elapsed - breaksSec)
}

function calcBreakSeconds(s: WorkSession): number {
  const now = new Date()
  const breaks = (s.breaks_json ?? []) as WorkSessionBreak[]
  return breaks.reduce((sum, b) => {
    const end = b.ended_at ? new Date(b.ended_at) : now
    return sum + Math.round((end.getTime() - new Date(b.started_at).getTime()) / 1000)
  }, 0)
}

export async function ShiftsReport({ users }: { users: UserMini[] }) {
  const supabase = await createClient()

  // Últimos 14 días
  const now = new Date()
  const fromDate = new Date(now.getTime() - 14 * MS_PER_DAY)

  const { data: sessions } = await supabase
    .from('work_sessions')
    .select('*')
    .gte('started_at', fromDate.toISOString())
    .order('started_at', { ascending: false })

  const list = (sessions ?? []) as WorkSession[]

  if (list.length === 0) {
    return (
      <p className="text-sm text-fm-on-surface-variant">
        Aún no hay jornadas registradas. Pídele al equipo que use el botón &quot;Iniciar jornada&quot; en /tiempo.
      </p>
    )
  }

  // Computar productive_seconds para sesiones aún abiertas (las cerradas ya lo tienen calculado).
  const userMap = new Map(users.map((u) => [u.id, u.full_name]))
  const openSessions = list.filter((s) => !s.ended_at)
  const liveProductive = new Map<string, number>()
  if (openSessions.length > 0) {
    const userIds = [...new Set(openSessions.map((s) => s.user_id))]
    const { data: entries } = await supabase
      .from('time_entries')
      .select('user_id, started_at, duration_seconds, ended_at')
      .in('user_id', userIds)
      .not('ended_at', 'is', null)
      .gte('started_at', fromDate.toISOString())
    for (const s of openSessions) {
      const total = (entries ?? [])
        .filter((e) => e.user_id === s.user_id && e.started_at >= s.started_at)
        .reduce((sum, e) => sum + ((e.duration_seconds as number | null) ?? 0), 0)
      liveProductive.set(s.id, total)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-fm-surface-container-high">
            <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Día</th>
            <th className="text-left py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Persona</th>
            <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Online</th>
            <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Pausas</th>
            <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Productivo</th>
            <th className="text-right py-2 pl-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">% Productivo</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const online = calcOnlineSeconds(s)
            const breaks = calcBreakSeconds(s)
            const productive = s.productive_seconds ?? liveProductive.get(s.id) ?? 0
            const pct = online > 0 ? Math.min(100, Math.round((productive / online) * 100)) : 0
            const pctColor = pct >= 70 ? '#00675c' : pct >= 40 ? '#f59e0b' : '#b31b25'
            return (
              <tr key={s.id} className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors">
                <td className="py-2.5 pr-4 text-fm-on-surface tabular-nums">{dateKey(s.started_at)}</td>
                <td className="py-2.5 px-4 text-fm-on-surface">
                  {userMap.get(s.user_id) ?? '—'}
                  {!s.ended_at && (
                    <span className="ml-2 text-[10px] font-bold text-fm-primary uppercase">activa</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-fm-on-surface">{formatDuration(online)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-fm-on-surface-variant">{formatDuration(breaks)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-fm-on-surface">{formatDuration(productive)}</td>
                <td className="py-2.5 pl-4 text-right font-bold tabular-nums" style={{ color: pctColor }}>
                  {pct}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
