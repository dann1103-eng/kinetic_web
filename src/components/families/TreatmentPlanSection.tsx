'use client'

import { useState } from 'react'
import { TreatmentPlanEditor } from './TreatmentPlanEditor'
import { TreatmentPlanHistory } from './TreatmentPlanHistory'
import {
  SERVICE_TYPE_LABELS,
  DAY_OF_WEEK_LABELS,
  SLOT_FREQUENCY_LABELS,
} from '@/types/db'
import type {
  TreatmentPlan,
  DayOfWeek,
  TreatmentPlanScheduleSlot,
} from '@/types/db'
import { isMonthlyFlatEntry } from '@/lib/domain/billing/monthly-flat'
import { parseDate } from '@/lib/domain/dates'

interface TherapistOption {
  id: string
  full_name: string
  role: string
}

interface Props {
  childId: string
  plan: TreatmentPlan | null
  therapists: TherapistOption[]
  canEdit: boolean
  /** Programa matutino del niño (BK/LK/Aula) — pre-carga esa terapia en el plan. */
  enrolledProgram?: import('@/types/db').MorningProgram | null
  /** Catálogo de servicios — variantes de mensualidad para el editor. */
  serviceCatalog?: import('@/types/db').ServiceCatalogItem[]
}

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function TreatmentPlanSection({
  childId,
  plan,
  therapists,
  canEdit,
  enrolledProgram,
  serviceCatalog,
}: Props) {
  const [showEditor, setShowEditor] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fm-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-fm-primary">description</span>
          Plan de tratamiento (ficha de acuerdo)
        </h2>
        <div className="flex items-center gap-2">
          {plan && (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="text-xs text-fm-on-surface-variant hover:text-fm-primary hover:underline"
            >
              Ver historial
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90"
            >
              {plan ? 'Editar plan' : 'Crear plan'}
            </button>
          )}
        </div>
      </div>

      {!plan ? (
        <p className="text-sm text-fm-on-surface-variant">
          No hay plan de tratamiento registrado para este niño/a.
          {canEdit && ' Hacé click en "Crear plan" para capturarlo.'}
        </p>
      ) : (
        <PlanReadOnly plan={plan} therapists={therapists} />
      )}

      {showEditor && (
        <TreatmentPlanEditor
          childId={childId}
          existing={plan}
          therapists={therapists}
          onClose={() => setShowEditor(false)}
          enrolledProgram={enrolledProgram}
          serviceCatalog={serviceCatalog}
        />
      )}

      {showHistory && plan && (
        <TreatmentPlanHistory planId={plan.id} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

function PlanReadOnly({
  plan,
  therapists,
}: {
  plan: TreatmentPlan
  therapists: TherapistOption[]
}) {
  // Construir grilla día × hora desde schedule_pattern_json
  const slotsByDay = new Map<DayOfWeek, TreatmentPlanScheduleSlot[]>()
  for (const slot of plan.schedule_pattern_json ?? []) {
    if (!slotsByDay.has(slot.day_of_week)) slotsByDay.set(slot.day_of_week, [])
    slotsByDay.get(slot.day_of_week)!.push(slot)
  }
  for (const [, list] of slotsByDay) {
    list.sort((a, b) => a.time_local.localeCompare(b.time_local))
  }
  const usedDays = DAY_ORDER.filter((d) => slotsByDay.has(d))

  const therapies = plan.therapies_json ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <KV
          label="Fecha de inicio"
          value={plan.starts_at ? parseDate(plan.starts_at).toLocaleDateString('es-SV') : '—'}
        />
        <KV label="Edad al inicio" value={plan.age_at_start_text ?? '—'} />
      </div>
      {plan.diagnosis_text && (
        <div className="text-sm">
          <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
            Diagnóstico
          </div>
          <p className="mt-0.5 text-fm-on-surface italic">{plan.diagnosis_text}</p>
        </div>
      )}

      {/* Terapias */}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
          Terapias y/o programas
        </div>
        {therapies.length === 0 ? (
          <p className="text-sm text-fm-on-surface-variant">No hay terapias capturadas.</p>
        ) : (
          <>
            <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold">Servicio</th>
                    <th className="text-left px-3 py-1.5 font-semibold">Terapista</th>
                    <th className="text-right px-3 py-1.5 font-semibold">Sesiones/mes</th>
                  </tr>
                </thead>
                <tbody>
                  {therapies.map((t, i) => {
                    const therapistName = t.therapist_id
                      ? therapists.find((th) => th.id === t.therapist_id)?.full_name ?? '—'
                      : null
                    return (
                      <tr
                        key={`${t.service}-${i}`}
                        className={`border-t border-fm-outline-variant/15 ${
                          t.active ? '' : 'opacity-50 line-through'
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          {SERVICE_TYPE_LABELS[t.service] ?? t.service}
                        </td>
                        <td className="px-3 py-1.5 text-fm-on-surface-variant">
                          {therapistName ?? (
                            <span className="italic text-fm-on-surface-variant/70">
                              {isMonthlyFlatEntry(t) ? 'Por grupo' : '— Sin asignar —'}
                            </span>
                          )}
                        </td>
                        <td className="text-right px-3 py-1.5 tabular-nums">
                          {isMonthlyFlatEntry(t) ? (
                            <span className="text-xs text-fm-primary font-medium whitespace-nowrap">
                              Mensualidad{t.days_per_week ? ` · ${t.days_per_week}d/sem` : ''}
                            </span>
                          ) : (
                            t.sessions_per_month
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-fm-on-surface-variant italic mt-1">
              Los precios se definen al cobrar cada ciclo mensual.
            </p>
            {plan.schedule_pattern_json && plan.schedule_pattern_json.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                Para que las citas aparezcan en la agenda, creá el ciclo mensual del niño/a.
              </p>
            )}
          </>
        )}
      </div>

      {/* Programación semanal */}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
          Programación semanal
        </div>
        {usedDays.length === 0 ? (
          <p className="text-sm text-fm-on-surface-variant">No hay horario capturado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {usedDays.map((d) => (
              <div
                key={d}
                className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-low/40 p-3"
              >
                <div className="text-xs font-semibold text-fm-on-surface mb-1.5">
                  {DAY_OF_WEEK_LABELS[d]}
                </div>
                <ul className="space-y-1">
                  {(slotsByDay.get(d) ?? []).map((s, i) => {
                    const freq = s.frequency ?? 'weekly'
                    return (
                      <li
                        key={`${d}-${i}`}
                        className="text-xs text-fm-on-surface flex items-center gap-2 flex-wrap"
                      >
                        <span className="font-mono tabular-nums text-fm-primary">{s.time_local}</span>
                        <span className="text-fm-on-surface-variant">·</span>
                        <span>{SERVICE_TYPE_LABELS[s.service] ?? s.service}</span>
                        <span className="text-fm-on-surface-variant">({s.duration_minutes}m)</span>
                        {freq !== 'weekly' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary">
                            {SLOT_FREQUENCY_LABELS[freq]}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {plan.observations && (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
            Observaciones
          </div>
          <p className="text-sm text-fm-on-surface mt-0.5 whitespace-pre-wrap">
            {plan.observations}
          </p>
        </div>
      )}
    </div>
  )
}

function KV({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
        {label}
      </div>
      <div className={`text-sm mt-0.5 ${highlight ? 'font-semibold text-fm-primary' : 'text-fm-on-surface'}`}>
        {value}
      </div>
    </div>
  )
}
