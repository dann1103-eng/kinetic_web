'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NewMonthlyCycleModal } from './NewMonthlyCycleModal'
import { cancelMonthlyCycle } from '@/app/actions/monthly-cycles'
import {
  MONTHLY_CYCLE_STATUS_LABELS,
} from '@/types/db'
import type { MonthlySessionCycle, TreatmentPlan } from '@/types/db'

interface Props {
  childId: string
  plan: TreatmentPlan | null
  cycles: MonthlySessionCycle[]
  canManage: boolean
}

const STATUS_CHIP: Record<MonthlySessionCycle['status'], string> = {
  paid_pending_generation: 'bg-amber-100 text-amber-800',
  generated: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-zinc-200 text-zinc-600',
}

function formatPeriod(periodMonth: string): string {
  const d = new Date(`${periodMonth.slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })
}

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `$${Number(n).toFixed(2)}`
}

export function MonthlyCyclesSection({ childId, plan, cycles: initial, canManage }: Props) {
  const router = useRouter()
  const [cycles, setCycles] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isCancelling, startCancel] = useTransition()

  function handleCancel() {
    if (!cancellingId) return
    setCancelError(null)
    startCancel(async () => {
      const res = await cancelMonthlyCycle(cancellingId, cancelReason)
      if (!res.ok) {
        setCancelError(res.error)
        return
      }
      setCycles((prev) => prev.map((c) => (c.id === cancellingId ? res.cycle : c)))
      setCancellingId(null)
      setCancelReason('')
      router.refresh()
    })
  }

  return (
    <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fm-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-fm-primary">payments</span>
          Ciclos mensuales
        </h2>
        {canManage && (
          <button
            type="button"
            disabled={!plan || !plan.primary_therapist_id}
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            title={
              !plan
                ? 'Primero hay que crear el plan de tratamiento'
                : !plan.primary_therapist_id
                  ? 'El plan no tiene terapista principal asignada'
                  : 'Marcar pago de un mes'
            }
          >
            + Marcar pago de mes
          </button>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant">
          Sin ciclos registrados. {canManage && plan
            ? 'Cuando recepción registre un pago, se generan las citas del mes y la factura.'
            : ''}
        </p>
      ) : (
        <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Mes</th>
                <th className="text-left px-3 py-1.5 font-semibold">Estado</th>
                <th className="text-right px-3 py-1.5 font-semibold">Pagado</th>
                <th className="text-right px-3 py-1.5 font-semibold">Citas</th>
                <th className="text-right px-3 py-1.5 font-semibold">Pago</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className="border-t border-fm-outline-variant/15">
                  <td className="px-3 py-1.5 font-medium text-fm-on-surface capitalize">
                    {formatPeriod(c.period_month)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[c.status]}`}>
                      {MONTHLY_CYCLE_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums text-fm-on-surface-variant">
                    {new Date(c.paid_at).toLocaleDateString('es-SV')}
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums">
                    {c.appointments_generated_count}
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                    <div>{formatMoney(c.payment_amount_usd)}</div>
                    {c.discount_kind && c.discount_kind !== 'none' && c.discount_value > 0 && (
                      <div className="text-[10px] font-medium text-emerald-700 mt-0.5">
                        {c.discount_kind === 'percent'
                          ? `−${c.discount_value}%`
                          : `−$${c.discount_value.toFixed(2)}`}
                        {c.discount_reason && (
                          <span
                            className="text-fm-on-surface-variant"
                            title={c.discount_reason}
                          >
                            {' · '}
                            {c.discount_reason.length > 18
                              ? `${c.discount_reason.slice(0, 18)}…`
                              : c.discount_reason}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {c.invoice_id && (
                        <Link
                          href={`/billing/invoices/${c.invoice_id}`}
                          className="text-xs font-semibold text-fm-primary hover:underline underline-offset-2"
                        >
                          Factura
                        </Link>
                      )}
                      {c.status === 'generated' && canManage && (
                        <button
                          type="button"
                          onClick={() => setCancellingId(c.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && plan && (
        <NewMonthlyCycleModal
          childId={childId}
          plan={plan}
          existingPeriods={cycles.filter((c) => c.status !== 'cancelled').map((c) => c.period_month)}
          onClose={() => setShowCreate(false)}
          onCreated={(cycle) => {
            setCycles((prev) => [cycle, ...prev])
            setShowCreate(false)
            router.refresh()
          }}
        />
      )}

      {cancellingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">Anular ciclo</h3>
            <p className="text-xs text-fm-on-surface-variant">
              Esto va a: anular la factura, cancelar las citas <b>scheduled</b> del mes
              (las ya iniciadas o completadas se respetan).
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo (mín. 5 caracteres)"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
            {cancelError && <p className="text-xs text-red-700">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingId(null)
                  setCancelReason('')
                  setCancelError(null)
                }}
                disabled={isCancelling}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {isCancelling ? 'Anulando…' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
