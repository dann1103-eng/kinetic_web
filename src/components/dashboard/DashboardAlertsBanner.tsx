import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { DashboardAlert } from '@/types/db'

const ALERT_TONE: Record<
  string,
  { bg: string; text: string; ring: string; icon: string }
> = {
  discharge: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    ring: 'border-emerald-200',
    icon: 'celebration',
  },
  dropout: {
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    ring: 'border-amber-200',
    icon: 'exit_to_app',
  },
  phase_milestone: {
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    ring: 'border-blue-200',
    icon: 'flag',
  },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Banner de alertas activas para el rol del usuario actual. RLS filtra por
 * `visible_to_roles`. Se renderiza en la parte superior de los dashboards de
 * coordinación (mgmt, coord_terapias, coord_familias).
 */
export async function DashboardAlertsBanner() {
  const supabase = await createClient()

  const { data: alertsRaw } = await supabase
    .from('dashboard_alerts')
    .select('id, alert_type, child_id, message, expires_at, created_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  const alerts = (alertsRaw ?? []) as DashboardAlert[]
  if (alerts.length === 0) return null

  // Lookup family_id para los child_id (link a ficha del niño)
  const childIds = alerts.map((a) => a.child_id).filter((id): id is string => !!id)
  const familyByChild: Record<string, string> = {}
  if (childIds.length > 0) {
    const { data: childRows } = await supabase
      .from('children')
      .select('id, family_id')
      .in('id', childIds)
    for (const row of (childRows ?? []) as { id: string; family_id: string }[]) {
      familyByChild[row.id] = row.family_id
    }
  }

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const tone = ALERT_TONE[a.alert_type] ?? ALERT_TONE.phase_milestone
        const familyId = a.child_id ? familyByChild[a.child_id] : undefined
        const href =
          a.child_id && familyId
            ? `/familias/${familyId}/children/${a.child_id}`
            : null
        return (
          <div
            key={a.id}
            className={`flex items-center gap-3 rounded-2xl border ${tone.bg} ${tone.text} ${tone.ring} px-4 py-3`}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px' }}
            >
              {tone.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{a.message}</p>
              <p className="text-[11px] opacity-70">
                Hasta {formatDate(a.expires_at)}
              </p>
            </div>
            {href && (
              <Link
                href={href}
                className="text-xs font-semibold underline opacity-80 hover:opacity-100"
              >
                Ver ficha →
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
