import Link from 'next/link'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import type { PendingByTherapist } from '@/lib/domain/progress-reports-pending'

interface Props {
  groups: PendingByTherapist[]
  /** family_id por childId para link directo. */
  familyIdByChild: Record<string, string>
}

/**
 * Vista resumen para directora: terapistas con informes de avances pendientes
 * en el cuatrimestre actual, agrupados.
 */
export function PendingByTherapistSummary({ groups, familyIdByChild }: Props) {
  if (groups.length === 0) return null

  const totalPending = groups.reduce((sum, g) => sum + g.pending.length, 0)

  return (
    <section className="rounded-2xl border border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/40 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-700 dark:text-amber-300 mt-0.5">assignment_late</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {totalPending === 1
              ? '1 informe de avances pendiente este cuatrimestre.'
              : `${totalPending} informes de avances pendientes este cuatrimestre.`}
          </h2>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Agrupados por terapista. El terapista debe generar el informe desde la ficha del niño/a.
          </p>

          <div className="mt-3 space-y-3">
            {groups.map((g) => (
              <details key={g.therapistId} className="group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-2 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 rounded px-2 py-1 -mx-2">
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {g.therapistName}{' '}
                    <span className="text-xs text-amber-800/70 dark:text-amber-200/70">
                      ({g.pending.length})
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-amber-700 dark:text-amber-300 text-base transition-transform group-open:rotate-180">
                    expand_more
                  </span>
                </summary>
                <ul className="mt-2 ml-2 space-y-1">
                  {g.pending.map((item) => {
                    const familyId = familyIdByChild[item.childId]
                    const label = `${item.childName} · ${
                      SERVICE_TYPE_LABELS[item.serviceType as ServiceType] ?? item.serviceType
                    }`
                    return (
                      <li
                        key={`${item.childId}|${item.serviceType}`}
                        className="flex items-center gap-2"
                      >
                        <span className="text-amber-700 dark:text-amber-300 text-xs">•</span>
                        {familyId ? (
                          <Link
                            href={`/familias/${familyId}/children/${item.childId}`}
                            className="text-sm text-amber-900 dark:text-amber-100 hover:underline"
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className="text-sm text-amber-900 dark:text-amber-100">{label}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
