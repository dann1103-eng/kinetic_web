'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertTreatmentPlan } from '@/app/actions/treatment-plans'
import { useUser } from '@/contexts/UserContext'
import { useDraft } from '@/hooks/useDraft'
import { DraftRestoreBanner, SaveStatusIndicator, OfflineSaveError } from '@/components/ui/DraftAutosave'
import {
  SERVICE_TYPE_LABELS,
  DAY_OF_WEEK_LABELS,
  SLOT_FREQUENCY_LABELS,
} from '@/types/db'
import type {
  DayOfWeek,
  MorningProgram,
  ServiceCatalogItem,
  ServiceType,
  SlotFrequency,
  TreatmentPlan,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
} from '@/types/db'
import { isMonthlyFlatEntry, isMorningProgramService, planHasTherapistCoverage } from '@/lib/domain/billing/monthly-flat'

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
  /**
   * Catálogo de servicios — para listar las variantes de mensualidad de los
   * programas matutinos (Blue Kids 2/3/4/5 días a la semana, etc.).
   */
  serviceCatalog?: ServiceCatalogItem[]
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

// Hora/duración default de un slot de programa matutino recién sembrado. La
// persona ajusta la jornada real en la "Programación semanal" (y, mes a mes,
// puede afinar la hora en la previsualización del ciclo).
const MORNING_DEFAULT_TIME = '08:00'
const MORNING_DEFAULT_DURATION = 180

/**
 * Días de la semana de un programa matutino según su variante de días/semana.
 * Distribución espaciada: 2→Mar/Jue · 3→Lun/Mié/Vie · 4→Lun-Jue · 5→Lun-Vie.
 */
function morningProgramDays(daysPerWeek: number): DayOfWeek[] {
  switch (daysPerWeek) {
    case 1:
      return ['wed']
    case 2:
      return ['tue', 'thu']
    case 3:
      return ['mon', 'wed', 'fri']
    case 4:
      return ['mon', 'tue', 'wed', 'thu']
    case 5:
      return ['mon', 'tue', 'wed', 'thu', 'fri']
    case 6:
      return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    default: {
      const all: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
      return all.slice(0, Math.min(Math.max(daysPerWeek, 0), 7))
    }
  }
}

/**
 * Sincroniza los slots de la programación semanal de un programa matutino con
 * su variante de días/semana: reemplaza los slots de ese servicio por uno por
 * cada día de la distribución. Preserva la hora/duración ya configuradas (por
 * día si el día se mantiene, o la del primer slot del servicio como base) para
 * no perder ajustes manuales al cambiar la variante.
 */
function syncMorningProgramSlots(
  prevSlots: TreatmentPlanScheduleSlot[],
  service: ServiceType,
  daysPerWeek: number | null,
): TreatmentPlanScheduleSlot[] {
  const others = prevSlots.filter((s) => s.service !== service)
  if (!daysPerWeek || daysPerWeek <= 0) return others
  const existing = prevSlots.filter((s) => s.service === service)
  const byDay = new Map(existing.map((s) => [s.day_of_week, s]))
  const repTime = existing[0]?.time_local ?? MORNING_DEFAULT_TIME
  const repDuration = existing[0]?.duration_minutes ?? MORNING_DEFAULT_DURATION
  const generated: TreatmentPlanScheduleSlot[] = morningProgramDays(daysPerWeek).map((day) => {
    const prev = byDay.get(day)
    return {
      day_of_week: day,
      time_local: prev?.time_local ?? repTime,
      duration_minutes: prev?.duration_minutes ?? repDuration,
      service,
      frequency: 'weekly',
    }
  })
  return [...others, ...generated]
}

export function TreatmentPlanEditor({
  childId,
  existing,
  therapists,
  onClose,
  enrolledProgram,
  serviceCatalog,
}: Props) {
  const router = useRouter()

  // Variantes de mensualidad por programa matutino (del catálogo de precios).
  const mensualidadVariants = useMemo(() => {
    const map = new Map<string, ServiceCatalogItem[]>()
    for (const item of serviceCatalog ?? []) {
      if (!item.active || item.category !== 'mensualidad' || !item.morning_program) continue
      if (!map.has(item.morning_program)) map.set(item.morning_program, [])
      map.get(item.morning_program)!.push(item)
    }
    for (const [, list] of map) list.sort((a, b) => (a.days_per_week ?? 0) - (b.days_per_week ?? 0))
    return map
  }, [serviceCatalog])

  /** days_per_week default para un programa: 5 si existe, si no la variante mayor. */
  function defaultDaysPerWeek(service: string): number | null {
    const variants = mensualidadVariants.get(service) ?? []
    if (variants.some((v) => v.days_per_week === 5)) return 5
    const last = variants[variants.length - 1]
    return last?.days_per_week ?? 5
  }
  const [diagnosisText, setDiagnosisText] = useState(existing?.diagnosis_text ?? '')
  const [startsAt, setStartsAt] = useState<string>(existing?.starts_at ?? '')
  const [ageAtStart, setAgeAtStart] = useState(existing?.age_at_start_text ?? '')
  const [observations, setObservations] = useState(existing?.observations ?? '')
  const [therapies, setTherapies] = useState<TreatmentPlanTherapyEntry[]>(() => {
    // Plan existente: cargar normalizando los programas matutinos a su
    // modalidad de mensualidad fija (planes viejos no traen billing_mode).
    if (existing?.therapies_json && existing.therapies_json.length > 0) {
      return existing.therapies_json.map((t) =>
        isMorningProgramService(t.service) && !t.billing_mode
          ? { ...t, billing_mode: 'monthly_flat', days_per_week: t.days_per_week ?? defaultDaysPerWeek(t.service) }
          : t,
      )
    }
    // Plan nuevo: si el niño está inscrito en programa matutino,
    // pre-cargar esa línea automáticamente para no obligar a buscarla.
    if (enrolledProgram) {
      // ServiceType incluye blue_kids / learning_kids / aula_educativa a partir
      // de la migración 0132. Cast directo porque MorningProgram es un subset.
      const programService = enrolledProgram as ServiceType
      return [
        {
          service: programService,
          active: true,
          sessions_per_month: 0,
          unit_cost_usd: 0,
          therapist_id: null,
          billing_mode: 'monthly_flat',
          days_per_week: defaultDaysPerWeek(programService),
        },
      ]
    }
    return [emptyTherapy()]
  })
  const [slots, setSlots] = useState<TreatmentPlanScheduleSlot[]>(() => {
    // Sembrar el horario de los programas matutinos que no traigan slots:
    // arregla planes recién inscritos (sin horario) y planes viejos cuyo
    // programa matutino nunca tuvo programación semanal (no se generaban citas).
    let initial = existing?.schedule_pattern_json ?? []
    for (const t of therapies) {
      if (
        t.active &&
        isMonthlyFlatEntry(t) &&
        t.days_per_week &&
        !initial.some((s) => s.service === t.service)
      ) {
        initial = syncMorningProgramSlots(initial, t.service, t.days_per_week)
      }
    }
    return initial
  })
  const [error, setError] = useState<string | null>(null)
  const [failedOffline, setFailedOffline] = useState(false)
  const [isPending, startTransition] = useTransition()

  // ── Autoguardado local de borrador (sobrevive cortes de luz/internet) ──
  const user = useUser()
  const formState = useMemo(
    () => ({ diagnosisText, startsAt, ageAtStart, observations, therapies, slots }),
    [diagnosisText, startsAt, ageAtStart, observations, therapies, slots],
  )
  const { draft, savedAt, online, clear } = useDraft(`treatment-plan:${childId}`, formState, {
    userId: user.id,
    serverUpdatedAt: existing?.updated_at ?? null,
  })
  const [draftDismissed, setDraftDismissed] = useState(false)

  function applyDraft(d: typeof formState) {
    setDiagnosisText(d.diagnosisText)
    setStartsAt(d.startsAt)
    setAgeAtStart(d.ageAtStart)
    setObservations(d.observations)
    setTherapies(d.therapies)
    setSlots(d.slots)
    setDraftDismissed(true)
  }

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
    // Días distintos marcados en el horario por servicio (para mensualidades).
    const daysByService = new Map<string, Set<DayOfWeek>>()
    for (const s of slots) {
      if (!daysByService.has(s.service)) daysByService.set(s.service, new Set())
      daysByService.get(s.service)!.add(s.day_of_week)
    }
    const warnings: string[] = []
    for (const t of therapies) {
      if (!t.active) continue
      const label = SERVICE_TYPE_LABELS[t.service] ?? t.service
      if (t.billing_mode === 'monthly_flat') {
        // Mensualidad: la cuota no aplica; se compara variante vs días marcados.
        const marked = daysByService.get(t.service)?.size ?? 0
        if (marked === 0) {
          warnings.push(`${label}: mensualidad sin días marcados en el horario.`)
        } else if (t.days_per_week && marked !== t.days_per_week) {
          warnings.push(
            `${label}: la variante es de ${t.days_per_week} días/semana pero el horario marca ${marked} día(s).`,
          )
        }
        continue
      }
      const estimated = estimatedByService.get(t.service) ?? 0
      if (estimated === 0 && t.sessions_per_month > 0) {
        warnings.push(
          `${label}: cuota ${t.sessions_per_month}/mes pero no hay slots en el horario.`,
        )
      } else if (estimated > 0 && t.sessions_per_month === 0) {
        warnings.push(
          `${label}: hay slots en el horario pero la cuota mensual es 0.`,
        )
      } else if (estimated > 0 && Math.abs(estimated - t.sessions_per_month) > 1) {
        warnings.push(
          `${label}: cuota ${t.sessions_per_month}/mes vs ~${estimated} estimado del patrón.`,
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
    setFailedOffline(false)
    // Validación: cada terapia activa NO matutina necesita su terapista.
    if (!planHasTherapistCoverage(therapies)) {
      setError('Cada terapia activa (no matutina) necesita una terapista asignada. Asigná terapista en cada línea.')
      return
    }
    startTransition(async () => {
      try {
        const res = await upsertTreatmentPlan({
          childId,
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
        clear() // envío exitoso → ya no hace falta el borrador local
        router.refresh()
        onClose()
      } catch {
        // Falla de red (sin internet): el borrador sigue a salvo en el dispositivo.
        setFailedOffline(true)
      }
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
          {draft && !draftDismissed && (
            <DraftRestoreBanner
              savedAt={savedAt}
              onRestore={() => applyDraft(draft)}
              onDiscard={() => { clear(); setDraftDismissed(true) }}
            />
          )}
          {/* Header data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    onChange={(e) => {
                      const service = e.target.value as ServiceType
                      const prevService = t.service
                      // Programas matutinos → modalidad mensualidad fija + se
                      // siembra su programación semanal (sin horario no se
                      // generan citas en el ciclo).
                      if (isMorningProgramService(service)) {
                        const dpw = defaultDaysPerWeek(service)
                        patchTherapy(idx, {
                          service,
                          billing_mode: 'monthly_flat',
                          days_per_week: dpw,
                          sessions_per_month: 0,
                        })
                        setSlots((prev) =>
                          syncMorningProgramSlots(
                            isMorningProgramService(prevService)
                              ? prev.filter((s) => s.service !== prevService)
                              : prev,
                            service,
                            dpw,
                          ),
                        )
                      } else {
                        patchTherapy(idx, { service, billing_mode: 'per_session', days_per_week: null })
                        // Si venía de un programa matutino, limpiar sus slots auto.
                        if (isMorningProgramService(prevService)) {
                          setSlots((prev) => prev.filter((s) => s.service !== prevService))
                        }
                      }
                    }}
                    className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
                  >
                    {SERVICE_OPTIONS.map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  {isMorningProgramService(t.service) ? (
                    <div
                      className="rounded-md border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 px-2 py-1.5 text-[11px] text-fm-on-surface-variant flex items-center"
                      title="Los programas matutinos los cubre el grupo (misses líderes), no llevan terapista individual."
                    >
                      Por grupo matutino
                    </div>
                  ) : (
                    <select
                      value={t.therapist_id ?? ''}
                      onChange={(e) => patchTherapy(idx, { therapist_id: e.target.value || null })}
                      title="Terapista a cargo de este tipo de terapia. Esto habilita al niño/a en 'mis niños' de esa persona."
                      className={`rounded-md border bg-white px-2 py-1.5 text-sm ${
                        t.active && !t.therapist_id
                          ? 'border-amber-400 ring-1 ring-amber-300'
                          : 'border-fm-outline-variant/30'
                      }`}
                    >
                      <option value="">— Terapista… —</option>
                      {therapists.map((th) => (
                        <option key={th.id} value={th.id}>
                          {th.full_name}
                        </option>
                      ))}
                    </select>
                  )}
                  {t.billing_mode === 'monthly_flat' ? (
                    <select
                      value={t.days_per_week ?? ''}
                      onChange={(e) => {
                        const dpw = e.target.value ? Number(e.target.value) : null
                        patchTherapy(idx, { days_per_week: dpw })
                        // Re-sembrar el horario según la variante elegida.
                        setSlots((prev) => syncMorningProgramSlots(prev, t.service, dpw))
                      }}
                      title="Variante del programa (mensualidad fija del catálogo). El precio se aplica al cobrar el ciclo."
                      className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="">Variante…</option>
                      {(mensualidadVariants.get(t.service)?.length
                        ? mensualidadVariants.get(t.service)!.map((v) => ({
                            days: v.days_per_week ?? 0,
                            label: `${v.days_per_week}d/sem · $${Number(v.unit_price_usd).toFixed(0)}`,
                          }))
                        : [2, 3, 4, 5].map((d) => ({ days: d, label: `${d}d/sem` }))
                      ).map((opt) => (
                        <option key={opt.days} value={opt.days}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
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
                  )}
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
                    onClick={() => {
                      const removed = therapies[idx]
                      setTherapies((prev) => prev.filter((_, i) => i !== idx))
                      // Limpiar el horario auto-sembrado del programa matutino.
                      if (removed && isMorningProgramService(removed.service)) {
                        setSlots((prev) => prev.filter((s) => s.service !== removed.service))
                      }
                    }}
                    className="text-xs text-red-600 hover:bg-red-50 rounded p-1"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-fm-on-surface-variant italic">
              Cada terapia lleva su <b>terapista asignada</b> — eso es lo que
              habilita al niño/a en <b>“mis niños”</b> de esa persona y asigna sus
              citas. (Ya no se usa “terapista principal”.) Los programas matutinos
              (Blue Kids, Learning Kids, Aula Educativa) los cubre el <b>grupo</b>,
              así que no llevan terapista individual. Los precios se definen al
              cobrar el ciclo mensual; los matutinos se cobran como <b>mensualidad
              fija</b> (elegí la variante de días/semana). Al elegir la variante se
              completa la <b>programación semanal</b> de abajo (ajustá día/hora).
              <b>Guardá el plan</b> para que el ciclo genere las citas.
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

          {failedOffline && (
            <OfflineSaveError onRetry={handleSave} retrying={isPending} />
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface">
          <SaveStatusIndicator savedAt={savedAt} online={online} className="mr-auto" />
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
