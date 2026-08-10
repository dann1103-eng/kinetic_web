'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  editMonthlyCycle,
  dryRunCycleRegeneration,
} from '@/app/actions/monthly-cycles'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  DiscountKind,
  MonthlyCandidateAppointment,
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  MorningProgram,
  ServiceType,
  TherapyBillingMode,
  TreatmentPlan,
  TreatmentPlanTherapyEntry,
} from '@/types/db'
import { applyDiscount } from '@/lib/domain/discounts'
import { describeMonthlyConflict } from '@/lib/domain/appointment'
import {
  daysPerWeekLabel,
  isMonthlyFlatEntry,
  therapyLineAmount,
} from '@/lib/domain/billing/monthly-flat'
import { DiscountFields } from './DiscountFields'
import { DraggableCycleCalendar, candidateSignature } from './DraggableCycleCalendar'
import {
  MorningProgramCycleSection,
  type MorningGroupSelection,
  type MorningCandidateOut,
} from './MorningProgramCycleSection'

interface Props {
  childId: string
  plan: TreatmentPlan
  cycle: MonthlySessionCycle
  /** Programa matutino del niño — habilita la sección de grupo. */
  enrolledProgram?: MorningProgram | null
  onClose: () => void
  onSaved: (cycle: MonthlySessionCycle) => void
}

interface PricedTherapy {
  service: string
  sessions_per_month: number
  unit_cost_usd: number
  billing_mode?: TherapyBillingMode
  days_per_week?: number | null
}

/** 'YYYY-MM-01' → 'YYYY-MM'. */
function periodMonthOf(periodMonth: string): string {
  return periodMonth.slice(0, 7)
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

export function EditMonthlyCycleModal({ childId, plan, cycle, enrolledProgram, onClose, onSaved }: Props) {
  const periodMonth = periodMonthOf(cycle.period_month)

  // Programa matutino: grupo + días (precargados del ciclo) + citas iteradas.
  const [morning, setMorning] = useState<MorningGroupSelection>({
    groupId: cycle.program_group_id ?? null,
    attendanceDays: cycle.attendance_days ?? [],
  })
  const [morningCandidates, setMorningCandidates] = useState<MorningCandidateOut[]>([])

  // Detalle de cobro: precargado del SNAPSHOT del ciclo (lo que se cobra hoy).
  const snapshotTherapies = useMemo(() => {
    const snap = (cycle.treatment_plan_snapshot ?? {}) as {
      therapies_json?: TreatmentPlanTherapyEntry[]
    }
    return (snap.therapies_json ?? []).filter((t) => t.active !== false)
  }, [cycle.treatment_plan_snapshot])

  const [priced, setPriced] = useState<PricedTherapy[]>(() =>
    snapshotTherapies.map((t) => ({
      service: t.service,
      sessions_per_month: t.sessions_per_month || 0,
      unit_cost_usd: Number(t.unit_cost_usd ?? 0),
      billing_mode: isMonthlyFlatEntry(t) ? 'monthly_flat' : 'per_session',
      days_per_week: t.days_per_week ?? null,
    })),
  )

  function patchPrice(idx: number, unit: number) {
    setPriced((prev) => prev.map((p, i) => (i === idx ? { ...p, unit_cost_usd: unit } : p)))
  }
  function patchSessions(idx: number, sessions: number) {
    setPriced((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, sessions_per_month: Math.max(0, sessions) } : p)),
    )
  }
  function removeTherapy(idx: number) {
    setPriced((prev) => prev.filter((_, i) => i !== idx))
  }

  // Terapias del plan activo que aún no están en el detalle (para "+ Agregar").
  const addableTherapies = useMemo(() => {
    const present = new Set(priced.map((p) => p.service))
    return (plan.therapies_json ?? [])
      .filter((t) => t.active && !present.has(t.service))
      .map((t) => ({
        service: t.service,
        sessions_per_month: t.sessions_per_month || 0,
        unit_cost_usd: Number(t.unit_cost_usd ?? 0),
        billing_mode: (isMonthlyFlatEntry(t) ? 'monthly_flat' : 'per_session') as TherapyBillingMode,
        days_per_week: t.days_per_week ?? null,
      }))
  }, [plan.therapies_json, priced])

  function addTherapy(service: string) {
    const found = addableTherapies.find((t) => t.service === service)
    if (found) setPriced((prev) => [...prev, found])
  }

  const subtotal = priced.reduce(
    (s, t) =>
      s +
      therapyLineAmount({
        service: t.service as ServiceType,
        billing_mode: t.billing_mode,
        sessions_per_month: t.sessions_per_month || 0,
        unit_cost_usd: t.unit_cost_usd || 0,
      }),
    0,
  )

  const [discountKind, setDiscountKind] = useState<DiscountKind>(cycle.discount_kind ?? 'none')
  const [discountValue, setDiscountValue] = useState<number>(Number(cycle.discount_value ?? 0))
  const [discountReason, setDiscountReason] = useState<string>(cycle.discount_reason ?? '')
  const computedTotal = applyDiscount(subtotal, { kind: discountKind, value: discountValue })

  const [dueDate, setDueDate] = useState<string>((cycle.due_date ?? '').slice(0, 10))
  const [reason, setReason] = useState('')

  // Regeneración de citas (opcional).
  const [regenerate, setRegenerate] = useState(false)
  // ¿El mes del ciclo ya empezó? Si sí, regenerar TODO el mes duplicaría las
  // sesiones ya dadas (el RPC solo cancela las `scheduled`), así que el alcance
  // por defecto es "solo las futuras".
  const monthInProgress = useMemo(() => {
    const firstDay = new Date(`${periodMonth.slice(0, 10)}T00:00:00`)
    return new Date().getTime() > firstDay.getTime()
  }, [periodMonth])
  const [onlyFuture, setOnlyFuture] = useState(true)
  const [dryRun, setDryRun] = useState<MonthlyCandidatesResult | null>(null)
  const [dryError, setDryError] = useState<string | null>(null)
  const [isLoadingDry, startLoadDry] = useTransition()
  const [editedCandidates, setEditedCandidates] = useState<MonthlyCandidateAppointment[]>([])
  const [hasEdits, setHasEdits] = useState(false)
  /**
   * Sesiones ya dadas del mes (por servicio) que la regeneración "solo futuras"
   * NO toca. Siguen cobrándose, así que se suman a los candidatos futuros para
   * que regenerar a mitad de mes no baje el monto.
   */
  const [preservedPast, setPreservedPast] = useState<Record<string, number>>({})
  const baseFor = (service: string) => preservedPast[service] ?? 0

  // Pool de citas que el patrón del plan puede generar este mes, por servicio
  // (= candidatas mostradas + las que sobraban por cuota). Es el tope para
  // AUMENTAR citas desde el stepper (ej. mes con 5 miércoles y cuota de 4).
  const poolByService = useMemo(() => {
    const map: Record<string, MonthlyCandidateAppointment[]> = {}
    if (!dryRun) return map
    for (const c of [...dryRun.candidates, ...dryRun.skipped_overquota]) {
      if (!map[c.service]) map[c.service] = []
      map[c.service].push(c)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    }
    return map
  }, [dryRun])

  // Conflictos del dry-run casados por firma, solo para resaltar celdas y armar
  // el texto de advertencia — ya no bloquean guardar/regenerar.
  const conflictSigs = useMemo(() => {
    const s = new Set<string>()
    for (const c of dryRun?.conflicts ?? []) s.add(candidateSignature(c.candidate))
    return s
  }, [dryRun])
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        describeMonthlyConflict(c, childId, formatDateTime(c.conflict_starts_at)),
      )
    }
    return m
  }, [dryRun, childId])
  const liveConflicts = useMemo(
    () => editedCandidates.filter((c) => conflictSigs.has(candidateSignature(c))),
    [editedCandidates, conflictSigs],
  )

  // Solo CARGA cuando se enciende la casilla; el "apagado" limpia en el onChange
  // (evita setState síncrono dentro del effect — regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!regenerate) return
    startLoadDry(async () => {
      const res = await dryRunCycleRegeneration(childId, periodMonth, monthInProgress && onlyFuture)
      if (!res.ok) {
        setDryError(res.error)
        setDryRun(null)
        setEditedCandidates([])
        setHasEdits(false)
        return
      }
      setDryError(null)
      setDryRun(res.result)
      setEditedCandidates(res.result.candidates)
      setPreservedPast(res.preservedPast)
      setHasEdits(false)
      // Sincronizar el cobro con las citas que realmente se generan, para que
      // facturar y calendario coincidan (solo terapias por sesión con citas en
      // el patrón). El stepper de abajo permite subir hasta el tope del mes.
      // Con "solo futuras" se suman las sesiones ya dadas, que no se regeneran
      // pero se siguen cobrando.
      const past = res.preservedPast
      const genCount: Record<string, number> = { ...past }
      for (const c of res.result.candidates) {
        genCount[c.service] = (genCount[c.service] ?? 0) + 1
      }
      const poolCount: Record<string, number> = { ...past }
      for (const c of [...res.result.candidates, ...res.result.skipped_overquota]) {
        poolCount[c.service] = (poolCount[c.service] ?? 0) + 1
      }
      setPriced((prev) =>
        prev.map((row) =>
          row.billing_mode !== 'monthly_flat' && (poolCount[row.service] ?? 0) > 0
            ? { ...row, sessions_per_month: genCount[row.service] ?? 0 }
            : row,
        ),
      )
    })
  }, [regenerate, childId, periodMonth, monthInProgress, onlyFuture])

  function toggleRegenerate(on: boolean) {
    setRegenerate(on)
    if (!on) {
      setDryRun(null)
      setDryError(null)
      setEditedCandidates([])
      setHasEdits(false)
    }
  }

  function handleMoveCandidate(idx: number, newStartsAt: string, newEndsAt: string) {
    setEditedCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c)),
    )
    setHasEdits(true)
  }
  function handleDeleteCandidate(idx: number) {
    setEditedCandidates((prev) => prev.filter((_, i) => i !== idx))
    setHasEdits(true)
  }
  function handleResetEdits() {
    if (!dryRun) return
    setEditedCandidates(dryRun.candidates)
    setHasEdits(false)
  }
  function handleRetimeCandidate(idx: number, newStartsAt: string, newEndsAt: string) {
    setEditedCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c)),
    )
    setHasEdits(true)
  }

  /**
   * Sube/baja en 1 las sesiones de una terapia cuando se regeneran las citas:
   * agrega la próxima cita libre del patrón (ej. el 5º miércoles del mes) o
   * quita la de fecha más tardía, manteniendo cobro = nº de citas.
   */
  function stepSessions(idx: number, delta: 1 | -1) {
    const svc = priced[idx].service
    const pool = poolByService[svc] ?? []
    if (pool.length === 0) {
      // Sin citas en el patrón: solo ajusta el cobro.
      patchSessions(idx, priced[idx].sessions_per_month + delta)
      return
    }
    // Las sesiones ya dadas del mes no están en el pool (no se regeneran) pero
    // se siguen cobrando: van de piso del contador.
    const base = baseFor(svc)
    if (delta < 0) {
      const mine = editedCandidates
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.service === svc)
        .sort((a, b) => a.c.starts_at.localeCompare(b.c.starts_at))
      if (mine.length === 0) return
      const removeI = mine[mine.length - 1].i
      const newCount = base + mine.length - 1
      setEditedCandidates((prev) => prev.filter((_, i) => i !== removeI))
      setPriced((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, sessions_per_month: newCount } : r)),
      )
      setHasEdits(true)
    } else {
      const used = new Set(
        editedCandidates.filter((c) => c.service === svc).map((c) => c.starts_at),
      )
      const next = pool.find((c) => !used.has(c.starts_at))
      if (!next) return // sin más slots del patrón este mes
      const newCount = base + used.size + 1
      setEditedCandidates((prev) =>
        [...prev, next].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      )
      setPriced((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, sessions_per_month: newCount } : r)),
      )
      setHasEdits(true)
    }
  }

  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  function handleSave() {
    setError(null)
    if (reason.trim().length < 3) {
      setError('Indicá una justificación del cambio.')
      return
    }
    if (priced.length === 0) {
      setError('El ciclo debe tener al menos una terapia.')
      return
    }
    if (regenerate && !dryRun) {
      setError('Esperá la previsualización de las citas antes de guardar.')
      return
    }
    if (enrolledProgram && !morning.groupId) {
      setError('Seleccioná el grupo del programa matutino.')
      return
    }
    startSave(async () => {
      const res = await editMonthlyCycle({
        cycleId: cycle.id,
        pricedTherapies: priced.map((p) => ({
          service: p.service,
          sessions_per_month: p.sessions_per_month,
          unit_cost_usd: p.unit_cost_usd,
          billing_mode: p.billing_mode,
        })),
        discountKind,
        discountValue,
        discountReason: discountReason.trim() || null,
        dueDate: dueDate || null,
        reason: reason.trim(),
        regenerateAppointments: regenerate,
        regenerateOnlyFuture: monthInProgress && onlyFuture,
        appointmentsOverride: regenerate && hasEdits ? editedCandidates : null,
        // Programa matutino: grupo + días + citas iteradas.
        programGroupId: enrolledProgram ? morning.groupId : null,
        attendanceDays: enrolledProgram ? morning.attendanceDays : null,
        morningAppointments: enrolledProgram && morningCandidates.length > 0 ? morningCandidates : null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved(res.cycle)
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">Editar ciclo del mes</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-xs text-fm-on-surface-variant">
            Editás el detalle de cobro de un ciclo <b>pendiente de pago</b>. Al guardar se
            recalcula el monto y se actualiza la factura (mismo número). Las citas no se
            tocan salvo que marqués la casilla de abajo.
          </p>

          {/* Programa matutino: grupo + días + calendarización */}
          {enrolledProgram && (
            <MorningProgramCycleSection
              program={enrolledProgram}
              periodMonth={periodMonth}
              value={morning}
              onChange={setMorning}
              onCandidatesChange={setMorningCandidates}
            />
          )}

          {/* Detalle de cobro */}
          <div className="rounded-lg border border-fm-outline-variant/20 overflow-hidden">
            <div className="px-3 py-2 bg-fm-surface-container-low/40">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Detalle de cobro
              </span>
            </div>
            {priced.length === 0 ? (
              <p className="px-3 py-2 text-xs text-fm-on-surface-variant italic">
                Sin terapias. Agregá al menos una.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                  <tr className="border-t border-fm-outline-variant/15">
                    <th className="text-left px-3 py-1 font-semibold">Terapia</th>
                    <th className="text-right px-3 py-1 font-semibold">Ses/mes</th>
                    <th className="text-right px-3 py-1 font-semibold">Precio unit.</th>
                    <th className="text-right px-3 py-1 font-semibold">Subtotal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {priced.map((t, idx) => (
                    <tr key={`${t.service}-${idx}`} className="border-t border-fm-outline-variant/10">
                      <td className="px-3 py-1.5">
                        {SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service}
                        {t.billing_mode === 'monthly_flat' && (
                          <span
                            className="ml-1.5 inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary font-medium align-middle"
                            title={`Mensualidad fija${daysPerWeekLabel(t.days_per_week) ? ` — ${daysPerWeekLabel(t.days_per_week)}` : ''}: se cobra 1 × precio.`}
                          >
                            Mensualidad{t.days_per_week ? ` ${t.days_per_week}d` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {t.billing_mode === 'monthly_flat' ? (
                          <span className="text-fm-on-surface-variant">—</span>
                        ) : regenerate && dryRun ? (
                          // Stepper ligado al calendario: + agrega la próxima cita
                          // del patrón (ej. 5º miércoles), − quita la última.
                          (() => {
                            const base = baseFor(t.service)
                            const poolLen = (poolByService[t.service]?.length ?? 0) + base
                            const atMax = poolLen > 0 && t.sessions_per_month >= poolLen
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => stepSessions(idx, -1)}
                                    disabled={t.sessions_per_month <= base}
                                    title={
                                      t.sessions_per_month <= base && base > 0
                                        ? `${base} sesión(es) ya dada(s) este mes — no se pueden quitar del cobro acá`
                                        : undefined
                                    }
                                    className="h-6 w-6 rounded-md border border-fm-outline-variant/30 bg-white text-fm-on-surface leading-none disabled:opacity-40 hover:bg-fm-surface-container"
                                    aria-label="Quitar una sesión"
                                  >
                                    −
                                  </button>
                                  <span className="w-7 text-center tabular-nums font-medium">
                                    {t.sessions_per_month}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => stepSessions(idx, 1)}
                                    disabled={atMax}
                                    title={atMax ? 'No hay más citas en el patrón este mes' : undefined}
                                    className="h-6 w-6 rounded-md border border-fm-outline-variant/30 bg-white text-fm-on-surface leading-none disabled:opacity-40 hover:bg-fm-surface-container"
                                    aria-label="Agregar una sesión"
                                  >
                                    +
                                  </button>
                                </div>
                                {atMax && (
                                  <span className="text-[9px] text-fm-on-surface-variant">
                                    máx {poolLen} (patrón)
                                  </span>
                                )}
                              </div>
                            )
                          })()
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={t.sessions_per_month}
                            onChange={(e) => patchSessions(idx, Number(e.target.value))}
                            className="w-16 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums text-right"
                          />
                        )}
                      </td>
                      <td className="text-right px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={t.unit_cost_usd}
                          onChange={(e) => patchPrice(idx, Number(e.target.value))}
                          className="w-20 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums text-right"
                        />
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                        ${therapyLineAmount({
                          service: t.service as ServiceType,
                          billing_mode: t.billing_mode,
                          sessions_per_month: t.sessions_per_month,
                          unit_cost_usd: t.unit_cost_usd,
                        }).toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeTherapy(idx)}
                          className="text-fm-on-surface-variant hover:text-fm-error"
                          aria-label="Quitar terapia"
                          title="Quitar terapia"
                        >
                          <span className="material-symbols-outlined text-base align-middle">close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {addableTherapies.length > 0 && (
              <div className="px-3 py-2 border-t border-fm-outline-variant/10">
                <label className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mr-2">
                  Agregar terapia del plan
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addTherapy(e.target.value)
                  }}
                  className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— Elegir —</option>
                  {addableTherapies.map((t) => (
                    <option key={t.service} value={t.service}>
                      {SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
                Fecha límite de pago (gracia)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-fm-on-surface-variant">
                Total del ciclo: <b>${computedTotal.toFixed(2)}</b>
              </p>
            </div>
          </div>

          <DiscountFields
            subtotal={subtotal}
            kind={discountKind}
            value={discountValue}
            reason={discountReason}
            onChangeKind={(k) => setDiscountKind(k)}
            onChangeValue={(v) => setDiscountValue(v)}
            onChangeReason={setDiscountReason}
            disabled={isSaving}
          />

          {/* Justificación */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Justificación del cambio (obligatoria)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ej. cambio de plan a mitad de mes: se agregó terapia ocupacional"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Regenerar citas (opcional) */}
          <div className="rounded-lg border border-fm-outline-variant/20 p-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={regenerate}
                onChange={(e) => toggleRegenerate(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-fm-on-surface">
                Regenerar también las citas del mes
                <span className="block text-[11px] text-fm-on-surface-variant">
                  Reemplaza las citas <b>programadas</b> del mes según el plan actual. Usá{' '}
                  <b>+ / −</b> en &ldquo;Ses/mes&rdquo; para agregar/quitar citas del mes (ej. un
                  mes con 5 miércoles). Si solo querés corregir el <b>cobro</b>, no hace falta
                  regenerar: cambiá &ldquo;Ses/mes&rdquo; con esta casilla apagada.
                </span>
              </span>
            </label>

            {regenerate && monthInProgress && (
              <div className="rounded-lg border border-fm-outline-variant/20 bg-fm-surface-container-low/40 p-2.5 space-y-1.5">
                <p className="text-[11px] font-semibold text-fm-on-surface">
                  ¿Qué parte del mes regenerar?
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={onlyFuture}
                    onChange={() => setOnlyFuture(true)}
                  />
                  <span className="text-[11px] text-fm-on-surface">
                    Solo de hoy en adelante
                    <span className="block text-fm-on-surface-variant">
                      No toca las sesiones ya dadas — se siguen cobrando igual.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={!onlyFuture}
                    onChange={() => setOnlyFuture(false)}
                  />
                  <span className="text-[11px] text-fm-on-surface">
                    Todo el mes
                    <span className="block text-amber-700">
                      Vuelve a crear también las citas de días ya pasados: si esas sesiones ya se
                      dieron, quedan <b>duplicadas</b> en la agenda.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {regenerate && (
              <div className="space-y-3">
                {isLoadingDry && (
                  <p className="text-xs text-fm-on-surface-variant">Calculando citas…</p>
                )}
                {dryError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {dryError}
                  </div>
                )}
                {dryRun && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                      <Stat label="A generar" value={editedCandidates.length} tone="ok" />
                      <Stat
                        label="Conflictos"
                        value={liveConflicts.length}
                        tone={liveConflicts.length > 0 ? 'error' : 'ok'}
                      />
                      <Stat
                        label="Saltadas (asueto)"
                        value={dryRun.summary.skipped_holiday_count}
                        tone="info"
                      />
                    </div>

                    {liveConflicts.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                        <p className="font-semibold">
                          {liveConflicts.length} cita(s) con conflicto de horario — en rojo en el calendario.
                        </p>
                        <p className="mt-0.5">
                          Pasá el mouse por encima de una celda roja para ver el detalle. Se puede
                          regenerar igual — revisalas cuando puedas, o movelas/quitalas ahora si
                          preferís resolverlas antes.
                        </p>
                      </div>
                    )}

                    {editedCandidates.length > 0 && (
                      <div className="rounded-lg border border-fm-outline-variant/20 p-3 bg-fm-surface-container-low/30">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-fm-on-surface">
                            Calendario de las {editedCandidates.length} citas a crear
                          </p>
                          {hasEdits && (
                            <button
                              type="button"
                              onClick={handleResetEdits}
                              className="text-[11px] text-fm-primary hover:underline"
                            >
                              Restaurar a defaults
                            </button>
                          )}
                        </div>
                        <DraggableCycleCalendar
                          periodMonth={cycle.period_month.slice(0, 10)}
                          candidates={editedCandidates}
                          onMove={handleMoveCandidate}
                          onRetime={handleRetimeCandidate}
                          onDelete={handleDeleteCandidate}
                          conflictSigs={conflictSigs}
                          conflictLabelBySig={conflictLabelBySig}
                        />
                      </div>
                    )}

                    {dryRun.skipped_holidays.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-fm-on-surface-variant hover:underline">
                          Ver {dryRun.skipped_holidays.length} fecha(s) saltada(s) por asueto
                        </summary>
                        <ul className="mt-1 ml-4 space-y-0.5">
                          {dryRun.skipped_holidays.map((c, i) => (
                            <li key={i} className="text-fm-on-surface-variant">
                              • {formatDateTime(c.starts_at)} —{' '}
                              {SERVICE_TYPE_LABELS[c.service as ServiceType] ?? c.service}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end items-center gap-2 px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface">
          <a
            href={`/api/ciclos/${cycle.id}/detalle`}
            target="_blank"
            rel="noopener noreferrer"
            className="mr-auto px-4 py-2 text-sm rounded-lg border border-fm-primary text-fm-primary font-medium hover:bg-fm-primary/5"
            title="Descargar el detalle de pago (para enviar al padre antes de cobrar)"
          >
            Descargar detalle de pago
          </a>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (regenerate && isLoadingDry)}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'error' | 'info'
}) {
  const colors =
    tone === 'error'
      ? 'bg-red-100 text-red-700 border-red-200'
      : tone === 'ok'
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : 'bg-zinc-100 text-zinc-700 border-zinc-200'
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
