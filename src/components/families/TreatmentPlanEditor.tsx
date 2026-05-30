'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertTreatmentPlan } from '@/app/actions/treatment-plans'
import {
  SERVICE_TYPE_LABELS,
  DAY_OF_WEEK_LABELS,
  SLOT_FREQUENCY_LABELS,
} from '@/types/db'
import type {
  DayOfWeek,
  MorningProgram,
  ServiceType,
  SlotFrequency,
  TreatmentPlan,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
} from '@/types/db'

interface TherapistOption {
  id: string
  full_name: string
  role: string
}

interface Props {
  childId: string
  existing: TreatmentPlan | null
  therapists: TherapistOption[]
  onClose: () => void
  /**
   * Programa matutino del niño (BK/LK/Aula). Si el plan es nuevo, se pre-carga
   * esa terapia. Los PRECIOS no se manejan en el plan — se definen al cobrar
   * el ciclo mensual.
   */
  enrolledProgram?: MorningProgram | null
}

const SERVICE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][]
const DAY_OPTIONS = Object.entries(DAY_OF_WEEK_LABELS) as [DayOfWeek, string][]
const FREQUENCY_OPTIONS = Object.entries(SLOT_FREQUENCY_LABELS) as [SlotFrequency, string][]

// Los precios (unit_cost_usd) se definen al cobrar el ciclo mensual, no en el
// plan. Acá quedan en 0 — son solo plantilla de qué terapias + cuántas sesiones.
function emptyTherapy(): TreatmentPlanTherapyEntry {
  return { service: 'lenguaje', active: true, sessions_per_month: 4, unit_cost_usd: 0, therapist_id: null }
}

function emptySlot(): TreatmentPlanScheduleSlot {
  return {
    day_of_week: 'mon',
    time_local: '14:00',
    duration_minutes: 30,
    service: 'lenguaje',
    frequency: 'weekly',
  }
}

export function TreatmentPlanEditor({
  childId,
  existing,
  therapists,
  onClose,
  enrolledProgram,
}: Props) {
  const router = useRouter()
  const [primaryTherapistId, setPrimaryTherapistId] = useState<string>(
    existing?.primary_therapist_id ?? '',
  )
  const [diagnosisText, setDiagnosisText] = useState(existing?.diagnosis_text ?? '')
  const [startsAt, setStartsAt] = useState<string>(existing?.starts_at ?? '')
  const [ageAtStart, setAgeAtStart] = useState(existing?.age_at_start_text ?? '')
  const [observations, setObservations] = useState(existing?.observations ?? '')
  const [therapies, setTherapies] = useState<TreatmentPlanTherapyEntry[]>(() => {
    // Plan existente: cargar tal cual
    if (existing?.therapies_json && existing.therapies_json.length > 0) {
      return existing.therapies_json
    }
    // Plan nuevo: si el niño está inscrito en programa matutino,
    // pre-cargar esa línea automáticamente para no obligar a buscarla.
    if (enrolledProgram) {
      // ServiceType incluye blue_kids / learning_kids / aula_educativa a partir
      // de la migración 0132. Cast directo porque MorningProgram es un subset.
      const programService = enrolledProgram as ServiceType
      return [
        { service: programService, active: true, sessions_per_month: 1, unit_cost_usd: 0, therapist_id: null },
      ]
    }
    return [emptyTherapy()]
  })
  const [slots, setSlots] = useState<TreatmentPlanScheduleSlot[]>(
    existing?.schedule_pattern_json ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * Quota vs patrón: para cada terapia activa, comparamos su `sessions_per_month`
   * con el conteo aproximado de slots × 4 semanas por servicio. Devuelve un
   * warning textual o null. Es solo informativo (no bloquea el guardado).
   */
  const quotaWarnings = useMemo(() => {
    // Estima cuántas sesiones/mes produce un slot según su frecuencia.
    const perMonthBy: Record<SlotFrequency, number> = {
      weekly: 4,
      biweekly: 2,
      monthly: 1,
    }
    const estimatedByService = new Map<string, number>()
    for (const s of slots) {
      const f: SlotFrequency = s.frequency ?? 'weekly'
      estimatedByService.set(
        s.service,
        (estimatedByService.get(s.service) ?? 0) + perMonthBy[f],
      )
    }
    const warnings: string[] = []
    for (const t of therapies) {
      if (!t.active) continue
      const estimated = estimatedByService.get(t.service) ?? 0
      if (estimated === 0 && t.sessions_per_month > 0) {
        warnings.push(
          `${t.service}: cuota ${t.sessions_per_month}/mes pero no hay slots en el horario.`,
        )
      } else if (estimated > 0 && t.sessions_per_month === 0) {
        warnings.push(
          `${t.service}: hay slots en el horario pero la cuota mensual es 0.`,
        )
      } else if (estimated > 0 && Math.abs(estimated - t.sessions_per_month) > 1) {
        warnings.push(
          `${t.service}: cuota ${t.sessions_per_month}/mes vs ~${estimated} estimado del patrón.`,
        )
      }
    }
    return warnings
  }, [therapies, slots])

  function patchTherapy(idx: number, patch: Partial<TreatmentPlanTherapyEntry>) {
    setTherapies((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }
  function patchSlot(idx: number, patch: Partial<TreatmentPlanScheduleSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await upsertTreatmentPlan({
        childId,
        primaryTherapistId: primaryTherapistId || null,
        diagnosisText: diagnosisText.trim() || null,
        startsAt: startsAt || null,
        ageAtStartText: ageAtStart.trim() || null,
        // Precios en 0 — se definen al cobrar el ciclo mensual.
        therapies: therapies.map((t) => ({ ...t, unit_cost_usd: 0 })),
        schedulePattern: slots,
        observations: observations.trim() || null,
        discountKind: 'none',
        discountValue: 0,
        discountReason: null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">
            {existing ? 'Editar plan de tratamiento' : 'Crear plan de tratamiento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Header data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Terapista principal">
              <select
                value={primaryTherapistId}
                onChange={(e) => setPrimaryTherapistId(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Sin asignar —</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.role})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de inicio">
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Edad al inicio (texto libre)">
              <input
                type="text"
                value={ageAtStart}
                onChange={(e) => setAgeAtStart(e.target.value)}
                placeholder='ej. "2a, 9m"'
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Diagnóstico (texto editorial)">
              <input
                type="text"
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
                placeholder='ej. "Alteraciones del procesamiento sensorial"'
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </Field>
          </div>

          {/* Terapias */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fm-on-surface">
                Terapias y/o programas
              </h3>
              <button
                type="button"
                onClick={() => setTherapies((prev) => [...prev, emptyTherapy()])}
                className="text-xs text-fm-primary hover:underline"
              >
                + Agregar terapia
              </button>
            </div>

            {therapies.length === 0 && (
              <p className="text-xs text-fm-on-surface-variant italic">
                Sin terapias. Agregá al menos una.
              </p>
            )}

            <div className="space-y-2">
              {therapies.map((t, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_84px_64px_30px] gap-2 items-center bg-fm-surface-container-low/40 rounded-lg p-2"
                >
                  <select
                    value={t.service}
                    onChange={(e) => patchTherapy(idx, { service: e.target.value as ServiceType })}
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    {SERVICE_OPTIONS.map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  <select
                    value={t.therapist_id ?? ''}
                    onChange={(e) => patchTherapy(idx, { therapist_id: e.target.value || null })}
                    title="Terapista para este tipo de terapia (si se deja en principal, usa la terapista principal del plan)"
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">↳ Usar principal</option>
                    {therapists.map((th) => (
                      <option key={th.id} value={th.id}>
                        {th.full_name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-fm-on-surface-variant">
                    <input
                      type="number"
                      min={0}
                      value={t.sessions_per_month}
                      onChange={(e) =>
                        patchTherapy(idx, { sessions_per_month: Number(e.target.value) })
                      }
                      placeholder="ses/mes"
                      className="w-14 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
                    />
                    /mes
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={t.active}
                      onChange={(e) => patchTherapy(idx, { active: e.target.checked })}
                    />
                    Activa
                  </label>
                  <button
                    type="button"
                    onClick={() => setTherapies((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-red-600 hover:bg-red-50 rounded p-1"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-fm-on-surface-variant italic">
              Los precios se definen al cobrar el ciclo mensual del niño/a.
            </p>
          </section>

          {/* Schedule */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fm-on-surface">
                Programación semanal
              </h3>
              <button
                type="button"
                onClick={() => setSlots((prev) => [...prev, emptySlot()])}
                className="text-xs text-fm-primary hover:underline"
              >
                + Agregar slot
              </button>
            </div>

            {slots.length === 0 && (
              <p className="text-xs text-fm-on-surface-variant italic">
                Sin horario semanal capturado.
              </p>
            )}

            <div className="space-y-2">
              {slots.map((s, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[100px_90px_70px_1fr_100px_30px] gap-2 items-center bg-fm-surface-container-low/40 rounded-lg p-2"
                >
                  <select
                    value={s.day_of_week}
                    onChange={(e) =>
                      patchSlot(idx, { day_of_week: e.target.value as DayOfWeek })
                    }
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    {DAY_OPTIONS.map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={s.time_local}
                    onChange={(e) => patchSlot(idx, { time_local: e.target.value })}
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
                  />
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={s.duration_minutes}
                    onChange={(e) =>
                      patchSlot(idx, { duration_minutes: Number(e.target.value) })
                    }
                    title="Duración (min)"
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
                  />
                  <select
                    value={s.service}
                    onChange={(e) => patchSlot(idx, { service: e.target.value as ServiceType })}
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    {SERVICE_OPTIONS.map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  <select
                    value={s.frequency ?? 'weekly'}
                    onChange={(e) =>
                      patchSlot(idx, { frequency: e.target.value as SlotFrequency })
                    }
                    title="Frecuencia: cada cuándo se repite este slot en el mes"
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    {FREQUENCY_OPTIONS.map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-red-600 hover:bg-red-50 rounded p-1"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {slots.length > 0 && (
                <p className="text-[11px] text-fm-on-surface-variant pl-2">
                  Frecuencia: <b>Semanal</b> = todos los días que coincidan ·{' '}
                  <b>Quincenal</b> = cada 14 días desde el primero del mes ·{' '}
                  <b>Mensual</b> = solo el primero del mes.
                </p>
              )}
            </div>
          </section>

          {/* Observations */}
          <section>
            <h3 className="text-sm font-semibold text-fm-on-surface mb-1">Observaciones</h3>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </section>

          {quotaWarnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">Cuota vs horario — atención:</p>
              <ul className="list-disc pl-4">
                {quotaWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] mt-1 italic">
                Esto no bloquea el guardado. Recordá: la <b>cuota mensual manda</b>.
                Si el patrón genera más sesiones que la cuota, las extras se
                descartan en el dry-run y solo se crean las primeras N
                cronológicas.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Guardando…' : existing ? 'Guardar cambios' : 'Crear plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
