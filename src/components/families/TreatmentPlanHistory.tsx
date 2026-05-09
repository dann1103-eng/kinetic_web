'use client'

import { useEffect, useState } from 'react'
import { listTreatmentPlanChanges } from '@/app/actions/treatment-plans'
import type { TreatmentPlanChange } from '@/types/db'

interface Props {
  planId: string
  onClose: () => void
}

const KIND_LABEL: Record<TreatmentPlanChange['kind'], string> = {
  create: 'Creación',
  update: 'Edición',
  deactivate: 'Desactivación',
}

const KIND_CHIP: Record<TreatmentPlanChange['kind'], string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  deactivate: 'bg-zinc-200 text-zinc-700',
}

export function TreatmentPlanHistory({ planId, onClose }: Props) {
  const [changes, setChanges] = useState<TreatmentPlanChange[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listTreatmentPlanChanges(planId)
      .then(setChanges)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error cargando historial.'))
  }, [planId])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">Historial de cambios</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {changes === null && !error && (
            <p className="text-sm text-fm-on-surface-variant">Cargando…</p>
          )}
          {error && (
            <p className="text-sm text-red-700">{error}</p>
          )}
          {changes && changes.length === 0 && (
            <p className="text-sm text-fm-on-surface-variant">Sin cambios registrados.</p>
          )}
          {changes && changes.length > 0 && (
            <ul className="space-y-3">
              {changes.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-fm-outline-variant/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${KIND_CHIP[c.kind]}`}
                    >
                      {KIND_LABEL[c.kind]}
                    </span>
                    <span className="text-xs text-fm-on-surface-variant">
                      {new Date(c.changed_at).toLocaleString('es-SV')}
                    </span>
                  </div>
                  {c.notes && (
                    <p className="text-sm text-fm-on-surface mt-2">{c.notes}</p>
                  )}
                  {c.kind === 'update' && (
                    <DiffSummary before={c.before_json} after={c.after_json} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Diff resumido: lista keys del after_json cuyos valores difieren del before_json. */
function DiffSummary({
  before,
  after,
}: {
  before: Record<string, unknown>
  after: Record<string, unknown>
}) {
  const fields = [
    'primary_therapist_id',
    'diagnosis_text',
    'starts_at',
    'age_at_start_text',
    'observations',
    'monthly_total_usd',
    'therapies_json',
    'schedule_pattern_json',
  ] as const

  const FIELD_LABEL: Record<(typeof fields)[number], string> = {
    primary_therapist_id: 'Terapista principal',
    diagnosis_text: 'Diagnóstico',
    starts_at: 'Fecha de inicio',
    age_at_start_text: 'Edad al inicio',
    observations: 'Observaciones',
    monthly_total_usd: 'Total mensual',
    therapies_json: 'Lista de terapias',
    schedule_pattern_json: 'Programación semanal',
  }

  const changed = fields.filter((f) => JSON.stringify(before?.[f]) !== JSON.stringify(after?.[f]))

  if (changed.length === 0) {
    return (
      <p className="text-xs text-fm-on-surface-variant mt-2 italic">
        Sin cambios detectables (puede ser una actualización de metadata).
      </p>
    )
  }

  return (
    <ul className="mt-2 space-y-0.5">
      {changed.map((f) => (
        <li key={f} className="text-xs text-fm-on-surface-variant">
          • Cambió: <span className="text-fm-on-surface font-medium">{FIELD_LABEL[f]}</span>
        </li>
      ))}
    </ul>
  )
}
