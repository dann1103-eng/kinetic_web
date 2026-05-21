import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { listWaitlist } from '@/app/actions/waitlist'
import { listPhaseCatalog } from '@/app/actions/intake-pipeline'
import { detectWaitlistAlerts } from '@/lib/domain/waitlist-alerts'
import {
  PHASE_GROUP_LABELS,
  SERVICE_TYPE_LABELS,
  type PhaseGroupNumber,
  type ServiceType,
} from '@/types/db'
import { WaitlistViewSwitcher } from '@/components/operacion/WaitlistViewSwitcher'
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
    service?: string
    group?: string
    historical?: string
  }>
}

export default async function ListaDeEsperaPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const serviceFilter = params.service as ServiceType | undefined
  const includeHistorical = params.historical === '1'
  const groupFilterRaw = params.group ? Number(params.group) : undefined
  const groupFilter: PhaseGroupNumber | undefined =
    groupFilterRaw && [1, 2, 3, 4, 5].includes(groupFilterRaw)
      ? (groupFilterRaw as PhaseGroupNumber)
      : undefined

  const supabase = await createClient()

  const [entries, phaseCatalog] = await Promise.all([
    listWaitlist({
      serviceType: serviceFilter,
      phaseGroup: groupFilter,
      includeHistorical,
    }),
    listPhaseCatalog(),
  ])

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

  // Lookup family_id de los niños vinculados a entradas con scheduled_child_id
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

  function buildQuery(overrides: Partial<{ service: string; group: string; historical: string }>) {
    const q = new URLSearchParams()
    const merged = {
      service: overrides.service ?? serviceFilter ?? '',
      group: overrides.group ?? (groupFilter ? String(groupFilter) : ''),
      historical: overrides.historical ?? (includeHistorical ? '1' : ''),
    }
    if (merged.service) q.set('service', merged.service)
    if (merged.group) q.set('group', merged.group)
    if (merged.historical) q.set('historical', merged.historical)
    const s = q.toString()
    return `/operacion/lista-de-espera${s ? `?${s}` : ''}`
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
          Familias que solicitaron cita y avanzan por las sub-fases del pipeline
          (1.1 → 3.2). Al completar <strong>3.2 Inscripción</strong> se crea
          automáticamente la familia + niño en el CRM. Las entradas descartadas
          quedan ocultas; activá el toggle <em>Histórico</em> para verlas.
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
      <div className="flex flex-col gap-3 border-b border-fm-outline-variant/20 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-fm-on-surface-variant">Grupo:</span>
          {[
            { val: undefined as number | undefined, label: 'Todos' },
            { val: 1, label: PHASE_GROUP_LABELS[1] },
            { val: 2, label: PHASE_GROUP_LABELS[2] },
            { val: 3, label: PHASE_GROUP_LABELS[3] },
          ].map((f) => {
            const active = (groupFilter ?? undefined) === f.val
            const href = buildQuery({ group: f.val ? String(f.val) : '' })
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
          <Link
            href={buildQuery({ historical: includeHistorical ? '' : '1' })}
            className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
              includeHistorical
                ? 'bg-fm-on-surface text-white'
                : 'text-fm-on-surface-variant hover:bg-fm-surface-container border border-fm-outline-variant/30'
            }`}
            title="Mostrar también descartados / ya inscritos"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {includeHistorical ? 'visibility' : 'visibility_off'}
            </span>
            Histórico
          </Link>
        </div>
      </div>

      <WaitlistViewSwitcher
        entries={entries}
        therapistsById={therapistsById}
        familyIdByChildId={familyIdByChildId}
        phaseCatalog={phaseCatalog}
      />
    </div>
  )
}
