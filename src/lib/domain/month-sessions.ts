/**
 * Sesiones del mes de TODO el centro, para el dashboard de gestión: el KPI
 * "Sesiones del mes" y el widget "Carga del mes" salen de aquí, así que son el
 * mismo número por construcción.
 *
 * Regla (la misma de los paneles por niño — `child-dashboard`, `ninos-dashboard`):
 * - Citas individuales: sin las lápidas `rescheduled` (una cita movida o superada
 *   por una regeneración del ciclo; contarlas duplica) ni las `cancelled`, y sin las
 *   citas sobrantes `programa_matutino` que `regenerateMorningAppointments` deja
 *   por niño y quedan `scheduled` para siempre (mig 0151).
 * - Programas matutinos: las jornadas de grupo (`program_group_sessions`), una por
 *   niño que le toca ese día; "asistidas" suma los presentes.
 *
 * ⚠️ Paginado a propósito. PostgREST corta CADA respuesta en 1000 filas sin avisar;
 * este dashboard decía "1000 sesiones" y "72 asistidas" cuando el mes tenía 1774
 * filas y 249 completadas. Ver `@/lib/supabase/paged`.
 */
import { toZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'
import { fetchAllPaged } from '@/lib/supabase/paged'
import { fetchMorningMonthOverview } from './morning-attendance'

const TZ = 'America/El_Salvador'

export interface MonthSessionsOverview {
  /** Todas las sesiones del mes (individuales vigentes + jornadas matutinas). */
  total: number
  /** Individuales completadas + presentes de programas matutinos. */
  completed: number
  /** Individuales marcadas no-show. */
  noShow: number
  /** Individuales aún `scheduled` o `in_progress`. */
  scheduled: number
  /** Sesiones por día del mes (1..31, hora de El Salvador). Suma = `total`. */
  byDay: Map<number, number>
}

export async function getMonthSessionsOverview(
  supabase: SupabaseClient<Database>,
  startISO: string,
  endISO: string,
): Promise<MonthSessionsOverview> {
  const [rows, morning] = await Promise.all([
    fetchAllPaged<{ starts_at: string | null; status: string }>(
      () =>
        supabase
          .from('appointments')
          .select('starts_at, status')
          .gte('starts_at', startISO)
          .lt('starts_at', endISO)
          .not('status', 'in', '(rescheduled,cancelled)')
          .neq('event_type', 'programa_matutino')
          .order('id'),
      'dashboard: citas del mes',
    ),
    fetchMorningMonthOverview(supabase, startISO, endISO),
  ])

  let completed = 0
  let noShow = 0
  let scheduled = 0
  const byDay = new Map<number, number>()
  for (const r of rows) {
    if (r.status === 'completed') completed++
    else if (r.status === 'no_show') noShow++
    else if (r.status === 'scheduled' || r.status === 'in_progress') scheduled++
    if (r.starts_at) {
      const day = toZonedTime(new Date(r.starts_at), TZ).getDate()
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
  }

  // 'YYYY-MM-DD' (fecha local de la jornada) → día del mes.
  for (const [date, n] of morning.loadByDate) {
    const day = Number(date.slice(8, 10))
    byDay.set(day, (byDay.get(day) ?? 0) + n)
  }

  return {
    total: rows.length + morning.total,
    completed: completed + morning.present,
    noShow,
    scheduled,
    byDay,
  }
}
