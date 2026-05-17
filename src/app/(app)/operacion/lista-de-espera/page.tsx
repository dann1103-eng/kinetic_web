import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { listWaitlist } from '@/app/actions/waitlist'
import { detectWaitlistAlerts } from '@/lib/domain/waitlist-alerts'
import { SERVICE_TYPE_LABELS, type ServiceType, type WaitlistStatus } from '@/types/db'
import { WaitlistTable } from '@/components/operacion/WaitlistTable'
import { NewWaitlistEntryButton } from '@/components/operacion/NewWaitlistEntryButton'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
]

interface PageProps {
  searchParams: Promise<{
    status?: string
    service?: string
  }>
}

const VALID_STATUSES: WaitlistStatus[] = ['waiting', 'contacted', 'scheduled', 'dropped']

export default async function ListaDeEsperaPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const statusFilter = (VALID_STATUSES.includes(params.status as WaitlistStatus)
    ? (params.status as WaitlistStatus)
    : undefined) as WaitlistStatus | undefined
  const serviceFilter = params.service as ServiceType | undefined

  const supabase = await createClient()

  const entries = await listWaitlist({
    status: statusFilter,
    serviceType: serviceFilter,
  })

  const alerts = await detectWaitlistAlerts(supabase)

  // Terapistas para resolver nombres y para el modal
  const { data: therapistsRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .in('role', ['terapista', 'maestra'])
    .order('full_name')

  const therapists = (therapistsRaw ?? []) as { id: string; full_name: string }[]
  const therapistsById: Record<string, string> = Object.fromEntries(
    therapists.map((t) => [t.id, t.full_name]),
  )

  // Lookup family_id de los niños vinculados a entradas 'scheduled' (para link directo a ficha)
  const scheduledChildIds = entries
    .map((e) => e.scheduled_child_id)
    .filter((x): x is string => !!x)
  const familyIdByChildId: Record<string, string> = {}
  if (scheduledChildIds.length > 0) {
    const { data: childRows } = await supabase
      .from('children')
      .select('id, family_id')
      .in('id', scheduledChildIds)
    for (const row of (childRows ?? []) as { id: string; family_id: string }[]) {
      familyIdByChildId[row.id] = row.family_id
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Operación
        </p>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
            Lista de espera
          </h1>
          <NewWaitlistEntryButton therapists={therapists} />
        </div>
        <p className="text-sm text-fm-on-surface-variant max-w-prose">
          Familias que solicitaron cita pero no se pudieron agendar. Al liberar capacidad,
          contactalas en orden de prioridad y antigüedad.
        </p>
      </header>

      {/* Alerta de urgentes estancadas */}
      {alerts.urgentStaleCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 mt-0.5">priority_high</span>
          <div>
            <p className="text-sm font-bold text-amber-900">
              {alerts.urgentStaleCount} {alerts.urgentStaleCount === 1 ? 'entrada urgente' : 'entradas urgentes'} sin atender hace más de 14 días
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Revisá las prioridades altas y contactá a las familias pronto.
            </p>
          </div>
        </div>
      )}

      {/* Stats por tipo de servicio */}
      {alerts.byServiceType.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.byServiceType.map((s) => (
            <div
              key={s.serviceType}
              className="bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-xl px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold text-fm-on-surface-variant">
                {SERVICE_TYPE_LABELS[s.serviceType as ServiceType] ?? s.serviceType}
              </p>
              <p className="text-xl font-bold text-fm-on-surface tabular-nums">
                {s.waitingCount}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-4 flex-wrap border-b border-fm-outline-variant/20 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fm-on-surface-variant">Estado:</span>
          {[
            { val: undefined, label: 'Todos' },
            { val: 'waiting', label: 'En espera' },
            { val: 'contacted', label: 'Contactadas' },
            { val: 'scheduled', label: 'Agendadas' },
            { val: 'dropped', label: 'Descartadas' },
          ].map((f) => {
            const active = (statusFilter ?? undefined) === f.val
            const query = new URLSearchParams()
            if (f.val) query.set('status', f.val)
            if (serviceFilter) query.set('service', serviceFilter)
            const href = `/operacion/lista-de-espera${query.toString() ? `?${query.toString()}` : ''}`
            return (
              <Link
                key={f.label}
                href={href}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  active
                    ? 'bg-fm-primary text-white'
                    : 'text-fm-on-surface-variant hover:bg-fm-surface-container'
                }`}
              >
                {f.label}
              </Link>
            )
          })}
        </div>
      </div>

      <WaitlistTable
        entries={entries}
        therapistsById={therapistsById}
        familyIdByChildId={familyIdByChildId}
      />
    </div>
  )
}
