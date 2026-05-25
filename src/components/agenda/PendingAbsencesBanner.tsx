'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/types/db'
import type { PendingAbsenceItem } from '@/lib/domain/absences-pending'
import { daysSinceReported, REPLACEMENT_WINDOW_DAYS } from '@/lib/domain/absence'

interface Props {
  items: PendingAbsenceItem[]
  /** Map childId → familyId para link directo a la ficha. */
  familyIdByChild?: Record<string, string>
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Banner para terapistas en /mi-dia: muestra inasistencias de sus alumnos
 * que aún no han sido resueltas (reagendadas o waived). El terapista no
 * puede resolverlas, pero verlas le permite recordar a la directora o
 * proponer un horario alternativo.
 */
export function PendingAbsencesBanner({ items, familyIdByChild }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  return (
    <section className="rounded-2xl border border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/40 p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-700 dark:text-amber-300 mt-0.5">event_busy</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {items.length === 1
              ? 'Hay 1 inasistencia de tus alumnos pendiente de reponer.'
              : `Hay ${items.length} inasistencias de tus alumnos pendientes de reponer.`}
          </h2>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            La directora coordina las reposiciones desde{' '}
            <Link href="/aprobaciones" className="font-medium underline">
              Aprobaciones
            </Link>
            . Si tenés un horario libre, avisale.
          </p>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-100 hover:underline inline-flex items-center gap-1"
          >
            <span
              className="material-symbols-outlined text-base transition-transform"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
            >
              expand_more
            </span>
            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          </button>

          {expanded && (
            <ul className="mt-3 space-y-1.5">
              {items.map((it) => {
                const familyId = familyIdByChild?.[it.childId]
                const serviceLabel = it.serviceType
                  ? SERVICE_TYPE_LABELS[it.serviceType as ServiceType] ?? it.serviceType
                  : '—'
                const days = daysSinceReported(it.reportedAt)
                const remaining = REPLACEMENT_WINDOW_DAYS - days
                return (
                  <li
                    key={it.absenceId}
                    className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100"
                  >
                    <span className="text-amber-700 dark:text-amber-300 mt-1 text-xs">•</span>
                    <div className="flex-1">
                      {familyId ? (
                        <Link
                          href={`/familias/${familyId}/children/${it.childId}`}
                          className="font-medium hover:underline"
                        >
                          {it.childName}
                        </Link>
                      ) : (
                        <span className="font-medium">{it.childName}</span>
                      )}
                      <span className="text-amber-800/80 dark:text-amber-200/80"> · {serviceLabel}</span>
                      <p className="text-[11px] text-amber-800/70 dark:text-amber-200/70">
                        Falló el {formatDateTime(it.originalStartsAt)}
                        {' · '}
                        {remaining <= 0
                          ? 'ventana vencida'
                          : `${remaining}d para que venza la ventana`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
