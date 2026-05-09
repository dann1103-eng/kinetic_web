import Link from 'next/link'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import type { PendingProgressReportItem } from '@/lib/domain/progress-reports-pending'

interface Props {
  pending: PendingProgressReportItem[]
  /** Si se conoce family_id por niño, link directo a la ficha. */
  familyIdByChild?: Record<string, string>
}

/**
 * Banner para terapistas en /mi-dia: lista terapias activas sin informe de
 * avances en el cuatrimestre actual. Solo se renderiza si hay ≥1 pendiente.
 */
export function PendingProgressReportsBanner({ pending, familyIdByChild }: Props) {
  if (pending.length === 0) return null

  return (
    <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-700 mt-0.5">assignment_late</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-amber-900">
            {pending.length === 1
              ? 'Tenés 1 informe de avances pendiente este cuatrimestre.'
              : `Tenés ${pending.length} informes de avances pendientes este cuatrimestre.`}
          </h2>
          <p className="text-xs text-amber-800/80 mt-0.5">
            Cada terapia activa necesita su informe cuatrimestral. Generalo desde la ficha del niño/a.
          </p>

          <ul className="mt-3 space-y-1.5">
            {pending.map((item) => {
              const familyId = familyIdByChild?.[item.childId]
              const label = `${item.childName} · ${
                SERVICE_TYPE_LABELS[item.serviceType as ServiceType] ?? item.serviceType
              }`
              return (
                <li key={`${item.childId}|${item.serviceType}`} className="flex items-center gap-2">
                  <span className="text-amber-700 text-xs">•</span>
                  {familyId ? (
                    <Link
                      href={`/familias/${familyId}/children/${item.childId}`}
                      className="text-sm text-amber-900 hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-sm text-amber-900">{label}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
