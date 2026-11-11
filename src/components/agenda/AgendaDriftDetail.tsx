import type { AgendaDriftLine, AgendaDriftRow } from '@/app/actions/agenda-plan-sync'
import type { DriftReason } from '@/lib/domain/agenda-plan-sync'
import { formatSvDateTime } from '@/lib/format/datetime-sv'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'

const REASON_LABEL: Record<DriftReason, string> = {
  not_in_plan: 'terapia que no está en el plan',
  off_pattern: 'día u hora que el plan no tiene',
  duplicate: 'duplicada',
}

function serviceLabel(service: string): string {
  return SERVICE_TYPE_LABELS[service as ServiceType] ?? service
}

/** "noviembre de 2026" a partir de 'YYYY-MM'. */
export function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number)
  // Día 15 al mediodía UTC: lejos de cualquier borde de zona horaria.
  return new Intl.DateTimeFormat('es-SV', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 15, 12)),
  )
}

/** Resumen de una línea: "2 se quitan · 3 se agregan". */
export function driftSummary(row: Pick<AgendaDriftRow, 'cancel' | 'create' | 'resize'>): string {
  const parts: string[] = []
  if (row.cancel.length > 0) {
    parts.push(`${row.cancel.length} ${row.cancel.length === 1 ? 'cita se quita' : 'citas se quitan'}`)
  }
  if (row.create.length > 0) {
    parts.push(`${row.create.length} ${row.create.length === 1 ? 'se agrega' : 'se agregan'}`)
  }
  if (row.resize.length > 0) {
    parts.push(
      `${row.resize.length} ${row.resize.length === 1 ? 'cambia de duración' : 'cambian de duración'}`,
    )
  }
  return parts.join(' · ')
}

function Lines({ lines, tone }: { lines: AgendaDriftLine[]; tone: 'cancel' | 'create' }) {
  return (
    <ul className="space-y-0.5">
      {lines.map((l, i) => (
        <li key={`${l.service}-${l.startsAt}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className={tone === 'cancel' ? 'line-through decoration-fm-error/60' : ''}>
            <span className="tabular-nums">{formatSvDateTime(l.startsAt)}</span>
            {' — '}
            <span className="font-medium">{serviceLabel(l.service)}</span>
          </span>
          {l.reason && (
            <span className="text-[11px] text-fm-on-surface-variant">({REASON_LABEL[l.reason]})</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Detalle de lo que cambiaría en la agenda de un ciclo: qué citas se quitan y
 * cuáles se agregan. Lo usan la revisión por mes y el aviso de la ficha.
 */
export function AgendaDriftDetail({
  row,
}: {
  row: Pick<AgendaDriftRow, 'cancel' | 'create' | 'resize' | 'kept'>
}) {
  return (
    <div className="grid gap-3 text-xs text-fm-on-surface sm:grid-cols-2">
      {row.cancel.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-fm-error">
            Se quitan de la agenda ({row.cancel.length})
          </p>
          <Lines lines={row.cancel} tone="cancel" />
        </div>
      )}
      {row.create.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-fm-primary">
            Se agregan según el plan ({row.create.length})
          </p>
          <Lines lines={row.create} tone="create" />
        </div>
      )}
      {row.resize.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-fm-on-surface">
            Cambian de duración ({row.resize.length})
          </p>
          <ul className="space-y-0.5">
            {row.resize.map((l, i) => (
              <li key={`${l.service}-${l.startsAt}-${i}`}>
                <span className="tabular-nums">{formatSvDateTime(l.startsAt)}</span>
                {' — '}
                <span className="font-medium">{serviceLabel(l.service)}</span>
                <span className="text-[11px] text-fm-on-surface-variant"> (pasa a {l.minutes} min)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.kept > 0 && (
        <p className="text-[11px] text-fm-on-surface-variant sm:col-span-2">
          {row.kept} {row.kept === 1 ? 'cita ya está' : 'citas ya están'} donde el plan dice y no se
          tocan.
        </p>
      )}
    </div>
  )
}
