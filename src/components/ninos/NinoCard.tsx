import Link from 'next/link'
import { ChildAvatar } from '@/components/ui/ChildAvatar'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { IntakePhaseCatalogEntry, ServiceType } from '@/types/db'
import type { NinoCardData } from '@/lib/domain/ninos-dashboard'
import { isChildInActiveTreatment, phaseByCode } from '@/lib/domain/intake-pipeline'

function ageText(birthDate: string | null): string {
  if (!birthDate) return ''
  const bd = new Date(birthDate)
  const now = new Date()
  const totalMonths =
    (now.getFullYear() - bd.getFullYear()) * 12 +
    (now.getMonth() - bd.getMonth())
  const years = Math.floor(totalMonths / 12)
  const rem = totalMonths % 12
  if (totalMonths < 24) return `${totalMonths} meses`
  if (rem === 0) return `${years} años`
  return `${years}a ${rem}m`
}

function formatPeriod(ym: string): string {
  return new Date(`${ym.slice(0, 7)}-01T12:00:00`).toLocaleDateString('es-SV', {
    month: 'short',
    year: 'numeric',
  })
}

interface Props {
  data: NinoCardData
  phaseCatalog: IntakePhaseCatalogEntry[]
}

export function NinoCard({ data, phaseCatalog }: Props) {
  const { child, plan, attendance, lastCycle } = data

  const therapies = (plan?.therapies_json ?? []).filter((t) => t.active !== false)
  const attendancePct =
    attendance && attendance.total > 0
      ? Math.round((attendance.completed / attendance.total) * 100)
      : null

  const phase = phaseByCode(child.current_phase_code, phaseCatalog)
  const isActive = isChildInActiveTreatment(child.current_phase_code)

  return (
    <Link
      href={`/familias/${child.family_id}/children/${child.id}`}
      className="group block bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 hover:border-fm-primary/30 hover:shadow-md transition-all duration-150 space-y-3"
    >
      {/* Header: avatar + nombre + edad */}
      <div className="flex items-start gap-3">
        <ChildAvatar name={child.full_name} photoUrl={child.photo_url} size="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-fm-on-surface text-sm leading-snug line-clamp-2">
            {child.full_name}
          </h3>
          {child.birth_date && (
            <p className="text-xs text-fm-on-surface-variant mt-0.5">
              {ageText(child.birth_date)}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {phase && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fm-primary/8 text-fm-primary font-medium">
                {phase.group_number}.{phase.sub_order} {phase.label}
              </span>
            )}
            {!isActive && phase && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                {phase.is_terminal ? 'Cerrado' : 'No activo'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Terapias del plan activo */}
      {therapies.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {therapies.slice(0, 4).map((t) => (
            <span
              key={t.service}
              className="text-[9px] px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant font-medium"
            >
              {SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service}
            </span>
          ))}
          {therapies.length > 4 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant/70 font-medium">
              +{therapies.length - 4}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-fm-on-surface-variant/50">Sin plan activo</p>
      )}

      {/* Asistencia del mes seleccionado */}
      {attendance !== null && attendance.total > 0 ? (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-fm-on-surface-variant">Asistencia del mes</span>
            <span className="tabular-nums font-semibold text-fm-on-surface">
              {attendance.completed}/{attendance.total}
              {attendancePct !== null && (
                <span className="text-fm-on-surface-variant font-normal">
                  {' '}({attendancePct}%)
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 bg-fm-surface-container rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                attendancePct !== null && attendancePct >= 80
                  ? 'bg-emerald-500'
                  : attendancePct !== null && attendancePct >= 50
                    ? 'bg-amber-400'
                    : 'bg-fm-error'
              }`}
              style={{ width: `${attendancePct ?? 0}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-fm-on-surface-variant/50">Sin sesiones este mes</p>
      )}

      {/* Último pago */}
      <div className="border-t border-fm-outline-variant/15 pt-2 flex items-baseline justify-between gap-2">
        {lastCycle ? (
          <>
            <span className="text-[10px] text-fm-on-surface-variant">
              Último pago ·{' '}
              <span className="capitalize">{formatPeriod(lastCycle.period_month)}</span>
            </span>
            <span className="text-xs font-semibold tabular-nums text-fm-on-surface">
              ${Number(lastCycle.payment_amount_usd).toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-fm-on-surface-variant/50">Sin pagos registrados</span>
        )}
      </div>
    </Link>
  )
}
