'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  confirmMonthlyPaymentAndGenerate,
  dryRunMonthlyGeneration,
} from '@/app/actions/monthly-cycles'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  ServiceType,
  TreatmentPlan,
} from '@/types/db'

interface Props {
  childId: string
  plan: TreatmentPlan
  /** Períodos ya existentes (no cancelled) para evitar duplicar. */
  existingPeriods: string[]
  onClose: () => void
  onCreated: (cycle: MonthlySessionCycle) => void
}

const PAYMENT_METHODS: { value: 'cash' | 'transfer' | 'card' | 'other'; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'other', label: 'Otro' },
]

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
  existingPeriods,
  onClose,
  onCreated,
}: Props) {
  const [periodMonth, setPeriodMonth] = useState<string>(defaultPeriodMonth())
  const [paymentAmount, setPaymentAmount] = useState<number>(plan.monthly_total_usd ?? 0)
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'transfer' | 'card' | 'other'
  >('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')

  const [dryRun, setDryRun] = useState<MonthlyCandidatesResult | null>(null)
  const [dryError, setDryError] = useState<string | null>(null)
  const [isLoadingDry, startLoadDry] = useTransition()

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
        return
      }
      setDryRun(res.result)
    })
  }, [childId, periodMonth, periodAlreadyUsed])

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
        paymentAmountUsd: paymentAmount,
        paymentMethod,
        paymentReference: paymentReference.trim() || null,
        notes: notes.trim() || null,
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
    paymentAmount >= 0 &&
    !isConfirming

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">
            Marcar pago de ciclo mensual
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
            <Field label="Monto pagado (USD)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm tabular-nums"
              />
              {plan.monthly_total_usd !== null &&
                paymentAmount !== plan.monthly_total_usd && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Total del plan: ${plan.monthly_total_usd.toFixed(2)}.
                    {paymentAmount < plan.monthly_total_usd
                      ? ' Pago parcial.'
                      : ' Pago superior al esperado.'}
                  </p>
                )}
            </Field>
            <Field label="Método de pago">
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as typeof paymentMethod)
                }
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Referencia (recibo, n° transferencia)">
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="opcional"
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </Field>
          </div>

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

                {dryRun.candidates.length > 0 &&
                  dryRun.summary.conflict_count === 0 && (
                    <CandidateList candidates={dryRun.candidates} />
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
            {isConfirming ? 'Generando…' : 'Confirmar pago y generar'}
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

function CandidateList({
  candidates,
}: {
  candidates: MonthlyCandidatesResult['candidates']
}) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-fm-primary hover:underline font-medium">
        Ver las {candidates.length} citas que se van a crear
      </summary>
      <ul className="mt-1 ml-4 space-y-0.5">
        {candidates.map((c, i) => (
          <li key={i} className="text-fm-on-surface">
            • {formatDateTime(c.starts_at)} —{' '}
            {SERVICE_TYPE_LABELS[c.service as ServiceType] ?? c.service}{' '}
            <span className="text-fm-on-surface-variant">({c.duration_minutes}m)</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
