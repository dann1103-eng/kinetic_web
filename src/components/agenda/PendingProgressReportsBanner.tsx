'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ServiceType } from '@/types/db'
import {
  isPendingStatus,
  type ActiveTherapyReportStatus,
  type ActiveTherapySummary,
} from '@/lib/domain/progress-reports-pending'

interface Props {
  /** TODAS las terapias activas del cuatrimestre (Q1+Q2 = pares activos). */
  summary: ActiveTherapySummary[]
  /** Map childId → familyId para link directo a la ficha. */
  familyIdByChild?: Record<string, string>
}

const STATUS_LABEL: Record<ActiveTherapyReportStatus, string> = {
  none: 'Pendiente',
  draft: 'Borrador',
  rejected: 'Rechazado, corregir',
  submitted: 'Enviado, esperando',
  approved: 'Aprobado',
  sent_to_family: 'Enviado a familia',
}

const STATUS_CHIP: Record<ActiveTherapyReportStatus, string> = {
  none: 'bg-amber-200 text-amber-900',
  draft: 'bg-amber-200 text-amber-900',
  rejected: 'bg-rose-200 text-rose-900',
  submitted: 'bg-blue-200 text-blue-900',
  approved: 'bg-emerald-200 text-emerald-900',
  sent_to_family: 'bg-emerald-200 text-emerald-900',
}

/**
 * Banner para terapistas en /mi-dia: alerta sobre informes pendientes este
 * cuatrimestre. Es expandible para mostrar las 3 respuestas a las queries:
 *   - Q1+Q2: las terapias activas (todas las del cuatrimestre)
 *   - Q3: cuáles ya tienen informe (status badge)
 */
export function PendingProgressReportsBanner({ summary, familyIdByChild }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (summary.length === 0) return null

  const pending = summary.filter((s) => isPendingStatus(s.reportStatus))
  if (pending.length === 0) return null // sin pendientes → no banner

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
            De {summary.length} terapia{summary.length === 1 ? '' : 's'} activa{summary.length === 1 ? '' : 's'} este cuatrimestre.
            Cada terapia activa necesita su informe cuatrimestral.
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

          {/* Toggle de detalle: muestra TODAS las terapias activas con su estado */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs font-medium text-amber-900 hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
              expand_more
            </span>
            {expanded
              ? 'Ocultar detalle'
              : `Ver mis ${summary.length} terapia${summary.length === 1 ? '' : 's'} activa${summary.length === 1 ? '' : 's'} con estado`}
          </button>

          {expanded && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-amber-800/70 bg-amber-100/50">
                  <tr>
                    <th className="text-left font-semibold px-3 py-1.5">Niño/a</th>
                    <th className="text-left font-semibold px-3 py-1.5">Terapia</th>
                    <th className="text-left font-semibold px-3 py-1.5">Estado del informe</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => {
                    const familyId = familyIdByChild?.[s.childId]
                    const label = SERVICE_TYPE_LABELS[s.serviceType as ServiceType] ?? s.serviceType
                    return (
                      <tr
                        key={`${s.childId}|${s.serviceType}`}
                        className="border-t border-amber-100"
                      >
                        <td className="px-3 py-1.5 text-amber-900">
                          {familyId ? (
                            <Link
                              href={`/familias/${familyId}/children/${s.childId}`}
                              className="hover:underline"
                            >
                              {s.childName}
                            </Link>
                          ) : (
                            s.childName
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-amber-900">{label}</td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CHIP[s.reportStatus]}`}
                          >
                            {STATUS_LABEL[s.reportStatus]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-amber-800/70 px-3 py-2 bg-amber-50 border-t border-amber-100">
                Pendientes: <b>{pending.length}</b> · Ya cubiertos (en revisión, aprobados o enviados a familia): <b>{summary.length - pending.length}</b>.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
