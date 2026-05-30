'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  confirmMonthlyPaymentAndGenerate,
  dryRunMonthlyGeneration,
} from '@/app/actions/monthly-cycles'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  DiscountKind,
  MonthlyCandidateAppointment,
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  MorningProgram,
  ServiceCatalogItem,
  ServiceType,
  TreatmentPlan,
} from '@/types/db'
import { applyDiscount } from '@/lib/domain/discounts'
import { DiscountFields } from './DiscountFields'
import { DraggableCycleCalendar } from './DraggableCycleCalendar'

interface Props {
  childId: string
  plan: TreatmentPlan
  /** Catálogo de terapias individuales — para precargar precios estándar. */
  therapyCatalog?: ServiceCatalogItem[]
  /** Programa matutino del niño — activa el precio BK precargado. */
  enrolledProgram?: MorningProgram | null
  /** Períodos ya existentes (no cancelled) para evitar duplicar. */
  existingPeriods: string[]
  onClose: () => void
  onCreated: (cycle: MonthlySessionCycle) => void
}

/** Precio estándar del catálogo para un service_type (BK-aware). */
function catalogPriceFor(
  catalog: ServiceCatalogItem[] | undefined,
  service: string,
  enrolledProgram: MorningProgram | null | undefined,
): number {
  if (!catalog) return 0
  // 1) Terapia individual por service_type.
  const ind = catalog.find(
    (c) => c.active && c.category === 'terapia_individual' && c.service_type === service,
  )
  if (ind) {
    if (enrolledProgram && ind.unit_price_bk_usd != null) return Number(ind.unit_price_bk_usd)
    return Number(ind.unit_price_usd)
  }
  // 2) Programa matutino (blue_kids / learning_kids / aula_educativa):
  //    buscar mensualidad de ese programa. Como el plan no guarda días/semana,
  //    se sugiere el precio del paquete de más días (5d) y la persona ajusta.
  if (service === 'blue_kids' || service === 'learning_kids' || service === 'aula_educativa') {
    const mens = catalog
      .filter((c) => c.active && c.category === 'mensualidad' && c.morning_program === service)
      .sort((a, b) => (b.days_per_week ?? 0) - (a.days_per_week ?? 0))[0]
    if (mens) return Number(mens.unit_price_usd)
  }
  return 0
}

interface PricedTherapy {
  service: string
  sessions_per_month: number
  unit_cost_usd: number
}

/** Default: el próximo mes (1ro). Devuelve 'YYYY-MM'. */
function defaultPeriodMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 2 // +1 para 1-indexed, +1 para "próximo"
  const y = month > 12 ? year + 1 : year
  const m = ((month - 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
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

export function NewMonthlyCycleModal({
  childId,
  plan,
  therapyCatalog,
  enrolledProgram,
  existingPeriods,
  onClose,
  onCreated,
}: Props) {
  // Precios por terapia — precargados del CATÁLOGO (no del plan, que ya no
  // guarda precios). La persona que cobra puede editar cada precio.
  const [priced, setPriced] = useState<PricedTherapy[]>(() =>
    (plan.therapies_json ?? [])
      .filter((t) => t.active)
      .map((t) => ({
        service: t.service,
        sessions_per_month: t.sessions_per_month || 0,
        // Si el plan trae un precio (>0) lo respetamos; si no, jalamos del catálogo.
        unit_cost_usd:
          (t.unit_cost_usd && t.unit_cost_usd > 0)
            ? t.unit_cost_usd
            : catalogPriceFor(therapyCatalog, t.service, enrolledProgram),
      })),
  )

  function patchPrice(idx: number, unit: number) {
    setPriced((prev) => prev.map((p, i) => (i === idx ? { ...p, unit_cost_usd: unit } : p)))
  }

  // Subtotal = suma(sesiones × precio) de las terapias precargadas.
  const planSubtotal = priced.reduce(
    (s, t) => s + (t.sessions_per_month || 0) * (t.unit_cost_usd || 0),
    0,
  )

  const [periodMonth, setPeriodMonth] = useState<string>(defaultPeriodMonth())
  // Descuento del ciclo: default = mismo que el plan, editable.
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    plan.discount_kind ?? 'none',
  )
  const [discountValue, setDiscountValue] = useState<number>(
    Number(plan.discount_value ?? 0),
  )
  const [discountReason, setDiscountReason] = useState<string>(
    plan.discount_reason ?? '',
  )
  // El monto sugerido se recalcula del subtotal aplicando el descuento del ciclo.
  const computedTotal = applyDiscount(planSubtotal, {
    kind: discountKind,
    value: discountValue,
  })
  // Fecha límite de pago (periodo de gracia). Default: día 5 del mes del ciclo.
  const [graceDate, setGraceDate] = useState<string>(`${periodMonth}-05`)
  useEffect(() => {
    setGraceDate(`${periodMonth}-05`)
  }, [periodMonth])
  const [notes, setNotes] = useState('')

  const [dryRun, setDryRun] = useState<MonthlyCandidatesResult | null>(null)
  const [dryError, setDryError] = useState<string | null>(null)
  const [isLoadingDry, startLoadDry] = useTransition()

  /** Citas que se van a crear. Inicialmente = dryRun.candidates; el usuario
   *  puede arrastrarlas a otros días en la grilla. */
  const [editedCandidates, setEditedCandidates] = useState<MonthlyCandidateAppointment[]>([])
  const [hasEdits, setHasEdits] = useState(false)

  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [isConfirming, startConfirm] = useTransition()

  const periodAlreadyUsed = existingPeriods.some((p) => p.startsWith(periodMonth))

  // Cargar dry-run automáticamente al cambiar período
  useEffect(() => {
    if (!periodMonth || periodAlreadyUsed) {
      setDryRun(null)
      return
    }
    setDryError(null)
    startLoadDry(async () => {
      const res = await dryRunMonthlyGeneration(childId, periodMonth)
      if (!res.ok) {
        setDryError(res.error)
        setDryRun(null)
        setEditedCandidates([])
        setHasEdits(false)
        return
      }
      setDryRun(res.result)
      setEditedCandidates(res.result.candidates)
      setHasEdits(false)
    })
  }, [childId, periodMonth, periodAlreadyUsed])

  function handleMoveCandidate(idx: number, newStartsAt: string, newEndsAt: string) {
    setEditedCandidates((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c,
      ),
    )
    setHasEdits(true)
  }

  function handleResetEdits() {
    if (!dryRun) return
    setEditedCandidates(dryRun.candidates)
    setHasEdits(false)
  }

  function handleConfirm() {
    setConfirmError(null)
    if (periodAlreadyUsed) {
      setConfirmError('Ya existe un ciclo activo para este mes. Anulá el anterior primero.')
      return
    }
    if (!dryRun) {
      setConfirmError('Esperá la previsualización antes de confirmar.')
      return
    }
    if (dryRun.summary.conflict_count > 0) {
      setConfirmError('Resolvé los conflictos antes de confirmar.')
      return
    }
    startConfirm(async () => {
      const res = await confirmMonthlyPaymentAndGenerate({
        childId,
        periodMonth,
        paymentAmountUsd: computedTotal,
        notes: notes.trim() || null,
        // Si el usuario movió fechas, mandar el override; si no, dejar que el RPC re-compute.
        appointmentsOverride: hasEdits ? editedCandidates : undefined,
        discountKind,
        discountValue,
        discountReason: discountReason.trim() || null,
        // Precios finales por terapia — sobreescriben el snapshot del plan.
        pricedTherapies: priced,
        // Fecha límite de pago (gracia).
        dueDate: graceDate,
      })
      if (!res.ok) {
        setConfirmError(res.error)
        return
      }
      onCreated(res.cycle)
    })
  }

  const canConfirm =
    !!dryRun &&
    !periodAlreadyUsed &&
    dryRun.summary.conflict_count === 0 &&
    !isConfirming

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">
            Generar ciclo del mes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mes del ciclo (YYYY-MM)">
              <input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              {periodAlreadyUsed && (
                <p className="mt-1 text-[11px] text-red-700">
                  Ya existe un ciclo activo para este mes.
                </p>
              )}
            </Field>
            <Field label="Fecha límite de pago (gracia)">
              <input
                type="date"
                value={graceDate}
                onChange={(e) => setGraceDate(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-fm-on-surface-variant">
                Total del ciclo: <b>${computedTotal.toFixed(2)}</b>. Pasada esta fecha se
                cobra 5% de recargo por cada 5 días de atraso. El pago se registra
                después con &ldquo;Marcar pagado&rdquo;.
              </p>
            </Field>
          </div>

          {/* Precios por terapia — precargados del catálogo, editables */}
          <div className="rounded-lg border border-fm-outline-variant/20 overflow-hidden">
            <div className="px-3 py-2 bg-fm-surface-container-low/40 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Precios del mes (precargados del catálogo{enrolledProgram ? ' · BK' : ''})
              </span>
            </div>
            {priced.length === 0 ? (
              <p className="px-3 py-2 text-xs text-fm-on-surface-variant italic">
                El plan no tiene terapias activas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                  <tr className="border-t border-fm-outline-variant/15">
                    <th className="text-left px-3 py-1 font-semibold">Terapia</th>
                    <th className="text-right px-3 py-1 font-semibold">Ses/mes</th>
                    <th className="text-right px-3 py-1 font-semibold">Precio unit.</th>
                    <th className="text-right px-3 py-1 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((t, idx) => (
                    <tr key={`${t.service}-${idx}`} className="border-t border-fm-outline-variant/10">
                      <td className="px-3 py-1.5">
                        {SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service}
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums text-fm-on-surface-variant">
                        {t.sessions_per_month}
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
                        ${(t.sessions_per_month * t.unit_cost_usd).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DiscountFields
            subtotal={planSubtotal}
            kind={discountKind}
            value={discountValue}
            reason={discountReason}
            onChangeKind={(k) => setDiscountKind(k)}
            onChangeValue={(v) => setDiscountValue(v)}
            onChangeReason={setDiscountReason}
            disabled={isConfirming}
          />

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Notas
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Preview */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fm-on-surface">
                Previsualización del mes
              </h3>
              {isLoadingDry && (
                <span className="text-xs text-fm-on-surface-variant">Calculando…</span>
              )}
            </div>

            {dryError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {dryError}
              </div>
            )}

            {dryRun && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <Stat
                    label="A generar"
                    value={dryRun.summary.candidate_count}
                    tone="ok"
                  />
                  <Stat
                    label="Conflictos"
                    value={dryRun.summary.conflict_count}
                    tone={dryRun.summary.conflict_count > 0 ? 'error' : 'ok'}
                  />
                  <Stat
                    label="Saltadas (asueto)"
                    value={dryRun.summary.skipped_holiday_count}
                    tone="info"
                  />
                  <Stat
                    label="Saltadas (cuota)"
                    value={dryRun.summary.skipped_overquota_count}
                    tone={dryRun.summary.skipped_overquota_count > 0 ? 'info' : 'ok'}
                  />
                </div>

                {dryRun.summary.conflict_count > 0 && (
                  <ConflictList conflicts={dryRun.conflicts} />
                )}

                {editedCandidates.length > 0 &&
                  dryRun.summary.conflict_count === 0 && (
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
                        periodMonth={`${periodMonth}-01`}
                        candidates={editedCandidates}
                        onMove={handleMoveCandidate}
                      />
                      {hasEdits && (
                        <p className="mt-2 text-[11px] text-amber-700">
                          Tenés cambios. Al confirmar se crearán las citas en
                          las fechas que marcaste, no las del patrón original.
                        </p>
                      )}
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

                {dryRun.skipped_overquota.length > 0 && (
                  <details className="text-xs" open>
                    <summary className="cursor-pointer text-amber-800 hover:underline font-medium">
                      Ver {dryRun.skipped_overquota.length} cita(s) saltada(s) por cuota
                    </summary>
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {dryRun.skipped_overquota.map((c, i) => (
                        <li key={i} className="text-amber-900">
                          • {formatDateTime(c.starts_at)} —{' '}
                          {SERVICE_TYPE_LABELS[c.service as ServiceType] ?? c.service}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 ml-4 text-[11px] text-amber-700/80 italic">
                      El patrón semanal generaba más sesiones que la cuota
                      mensual del plan. Se mantienen las primeras cronológicas.
                      Si el caso real es esa cantidad mayor, subí la cuota en
                      el plan.
                    </p>
                  </details>
                )}
              </div>
            )}
          </section>

          {confirmError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {confirmError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isConfirming ? 'Generando…' : 'Generar ciclo'}
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

function ConflictList({
  conflicts,
}: {
  conflicts: MonthlyCandidatesResult['conflicts']
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
      <p className="text-sm font-semibold text-red-900 mb-2">
        Conflictos de horario ({conflicts.length})
      </p>
      <ul className="space-y-1 text-xs text-red-900">
        {conflicts.slice(0, 20).map((c, i) => (
          <li key={i}>
            • {formatDateTime(c.candidate.starts_at)} —{' '}
            {SERVICE_TYPE_LABELS[c.candidate.service as ServiceType] ?? c.candidate.service}{' '}
            <span className="text-red-700">
              (choca con cita existente del terapista)
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-red-800">
        Movés/cancelás esos appointments en /agenda y volvés a calcular para confirmar.
      </p>
    </div>
  )
}

