'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NewMonthlyCycleModal } from './NewMonthlyCycleModal'
import { EditMonthlyCycleModal } from './EditMonthlyCycleModal'
import {
  cancelMonthlyCycle,
  markMonthlyCyclePaid,
  extendMonthlyCycleGrace,
  deleteMonthlyCycle,
} from '@/app/actions/monthly-cycles'
import {
  MONTHLY_CYCLE_STATUS_LABELS,
} from '@/types/db'
import { planHasTherapistCoverage } from '@/lib/domain/billing/monthly-flat'
import type {
  MonthlySessionCycle,
  TreatmentPlan,
  ServiceCatalogItem,
  MorningProgram,
} from '@/types/db'

interface Props {
  childId: string
  plan: TreatmentPlan | null
  cycles: MonthlySessionCycle[]
  canManage: boolean
  /** Puede anular ciclos (admin / directora / coordinadora_familias). */
  canCancel: boolean
  /** Puede ELIMINAR ciclos por completo (solo admin) — borra ciclo + factura
   *  + citas auto-generadas. Para ciclos de prueba o errores. */
  canDelete: boolean
  /** Catálogo de terapias individuales — para precargar precios al cobrar. */
  therapyCatalog?: ServiceCatalogItem[]
  /** Programa matutino del niño — activa precio BK precargado. */
  enrolledProgram?: MorningProgram | null
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

export function MonthlyCyclesSection({
  childId,
  plan,
  cycles: initial,
  canManage,
  canCancel,
  canDelete,
  therapyCatalog,
  enrolledProgram,
}: Props) {
  const router = useRouter()
  const [cycles, setCycles] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [editingCycle, setEditingCycle] = useState<MonthlySessionCycle | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isCancelling, startCancel] = useTransition()

  // Eliminar ciclo (admin)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  function handleDelete() {
    if (!deletingId) return
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteMonthlyCycle(deletingId)
      if (!res.ok) {
        setDeleteError(res.error)
        return
      }
      setCycles((prev) => prev.filter((c) => c.id !== deletingId))
      setDeletingId(null)
      router.refresh()
    })
  }

  // Marcar pagado
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'card' | 'other'>('cash')
  const [payReference, setPayReference] = useState('')
  const [payDate, setPayDate] = useState<string>('')
  const [payError, setPayError] = useState<string | null>(null)
  const [isPaying, startPay] = useTransition()

  function openPay(id: string) {
    setPayError(null)
    setPayMethod('cash')
    setPayReference('')
    // Hoy en zona SV (fecha de pago por defecto).
    setPayDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }))
    setPayingId(id)
  }

  function handlePay() {
    if (!payingId) return
    setPayError(null)
    startPay(async () => {
      const res = await markMonthlyCyclePaid({
        cycleId: payingId,
        paymentMethod: payMethod,
        paymentReference: payReference.trim() || null,
        paidAt: payDate ? new Date(`${payDate}T12:00:00`).toISOString() : undefined,
      })
      if (!res.ok) {
        setPayError(res.error)
        return
      }
      setCycles((prev) => prev.map((c) => (c.id === payingId ? res.cycle : c)))
      setPayingId(null)
      router.refresh()
    })
  }

  // Prorrogar gracia
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [extendDate, setExtendDate] = useState<string>('')
  const [extendReason, setExtendReason] = useState('')
  const [extendError, setExtendError] = useState<string | null>(null)
  const [isExtending, startExtend] = useTransition()

  function openExtend(c: MonthlySessionCycle) {
    setExtendError(null)
    setExtendReason('')
    setExtendDate((c.grace_extended_to ?? c.due_date ?? '').slice(0, 10))
    setExtendingId(c.id)
  }

  function handleExtend() {
    if (!extendingId) return
    setExtendError(null)
    startExtend(async () => {
      const res = await extendMonthlyCycleGrace(extendingId, extendDate, extendReason)
      if (!res.ok) {
        setExtendError(res.error)
        return
      }
      setCycles((prev) => prev.map((c) => (c.id === extendingId ? res.cycle : c)))
      setExtendingId(null)
      router.refresh()
    })
  }

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

  // Render helpers compartidos por la tabla (desktop) y las tarjetas (móvil).
  const renderStatusChips = (c: MonthlySessionCycle) => (
    <>
      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[c.status]}`}>
        {MONTHLY_CYCLE_STATUS_LABELS[c.status]}
      </span>
      {c.status !== 'cancelled' && (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            c.payment_status === 'paid'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {c.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
        </span>
      )}
    </>
  )

  const renderDuePaid = (c: MonthlySessionCycle) =>
    c.payment_status === 'paid' ? (
      c.paid_at ? new Date(c.paid_at).toLocaleDateString('es-SV') : '—'
    ) : (
      (() => {
        const due = c.grace_extended_to ?? c.due_date
        if (!due) return '—'
        const overdue =
          new Date(`${due.slice(0, 10)}T23:59:59`).getTime() < new Date().getTime()
        return (
          <span className={overdue ? 'text-fm-error font-medium' : ''}>
            vence {new Date(`${due.slice(0, 10)}T12:00:00`).toLocaleDateString('es-SV')}
            {c.grace_extended_to && <span title="Gracia prorrogada"> *</span>}
          </span>
        )
      })()
    )

  const renderMoney = (c: MonthlySessionCycle) => (
    <>
      <div>{formatMoney(c.payment_amount_usd)}</div>
      {c.surcharge_amount_usd > 0 && (
        <div className="text-[10px] font-medium text-fm-error mt-0.5">
          incl. recargo {formatMoney(c.surcharge_amount_usd)}
        </div>
      )}
      {c.discount_kind && c.discount_kind !== 'none' && c.discount_value > 0 && (
        <div className="text-[10px] font-medium text-emerald-700 mt-0.5">
          {c.discount_kind === 'percent'
            ? `−${c.discount_value}%`
            : `−$${c.discount_value.toFixed(2)}`}
          {c.discount_reason && (
            <span className="text-fm-on-surface-variant" title={c.discount_reason}>
              {' · '}
              {c.discount_reason.length > 18
                ? `${c.discount_reason.slice(0, 18)}…`
                : c.discount_reason}
            </span>
          )}
        </div>
      )}
    </>
  )

  const renderActions = (c: MonthlySessionCycle) => (
    <>
      {c.invoice_id && (
        <Link
          href={`/billing/invoices/${c.invoice_id}`}
          className="text-xs font-semibold text-fm-primary hover:underline underline-offset-2"
        >
          Factura
        </Link>
      )}
      {c.status === 'generated' && c.payment_status === 'pending' && canManage && (
        <>
          <button
            type="button"
            onClick={() => openPay(c.id)}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Marcar pagado
          </button>
          {plan && (
            <button
              type="button"
              onClick={() => setEditingCycle(c)}
              className="text-xs text-fm-primary hover:underline"
            >
              Editar
            </button>
          )}
          <button
            type="button"
            onClick={() => openExtend(c)}
            className="text-xs text-fm-on-surface-variant hover:underline"
          >
            Prorrogar gracia
          </button>
        </>
      )}
      {c.status === 'generated' && canCancel && (
        <button
          type="button"
          onClick={() => setCancellingId(c.id)}
          className="text-xs text-red-600 hover:underline"
        >
          Anular
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null)
            setDeletingId(c.id)
          }}
          className="text-xs text-red-700 hover:underline"
          title="Eliminar el ciclo por completo (factura y citas auto-generadas incluidas)"
        >
          Eliminar
        </button>
      )}
    </>
  )

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
            disabled={!plan || !planHasTherapistCoverage(plan.therapies_json)}
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            title={
              !plan
                ? 'Primero hay que crear el plan de tratamiento'
                : !planHasTherapistCoverage(plan.therapies_json)
                  ? 'Cada terapia activa (no matutina) del plan necesita una terapista asignada'
                  : 'Generar el ciclo del mes (factura pendiente)'
            }
          >
            + Generar ciclo
          </button>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant">
          Sin ciclos registrados. {canManage && plan
            ? 'Al generar el ciclo se crean las citas del mes en la agenda y la factura queda pendiente. El pago se registra después con “Marcar pagado” (no hace falta para que aparezca la agenda).'
            : ''}
        </p>
      ) : (
        <>
        {/* Desktop: tabla. overflow-x-auto (no -hidden) para no recortar acciones. */}
        <div className="hidden sm:block rounded-xl border border-fm-outline-variant/20 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Mes</th>
                <th className="text-left px-3 py-1.5 font-semibold">Estado</th>
                <th className="text-right px-3 py-1.5 font-semibold">Vence / Pagado</th>
                <th className="text-right px-3 py-1.5 font-semibold">Citas</th>
                <th className="text-right px-3 py-1.5 font-semibold">Monto</th>
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
                    <div className="flex flex-col gap-0.5 items-start">{renderStatusChips(c)}</div>
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums text-fm-on-surface-variant whitespace-nowrap">
                    {renderDuePaid(c)}
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums">
                    {c.appointments_generated_count}
                  </td>
                  <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                    {renderMoney(c)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      {renderActions(c)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Móvil: tarjetas apiladas — todas las acciones visibles (sin recorte). */}
        <div className="sm:hidden space-y-3">
          {cycles.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-fm-outline-variant/20 p-3.5 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-fm-on-surface capitalize">
                  {formatPeriod(c.period_month)}
                </span>
                <div className="text-right tabular-nums font-medium text-fm-on-surface">
                  {renderMoney(c)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">{renderStatusChips(c)}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fm-on-surface-variant tabular-nums">
                <span>{renderDuePaid(c)}</span>
                <span aria-hidden="true">·</span>
                <span>{c.appointments_generated_count} citas</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-fm-outline-variant/10">
                {renderActions(c)}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {showCreate && plan && (
        <NewMonthlyCycleModal
          childId={childId}
          plan={plan}
          therapyCatalog={therapyCatalog}
          enrolledProgram={enrolledProgram}
          existingPeriods={cycles.filter((c) => c.status !== 'cancelled').map((c) => c.period_month)}
          onClose={() => setShowCreate(false)}
          onCreated={(cycle) => {
            if (cycle?.id) {
              setCycles((prev) => [cycle, ...prev])
            }
            setShowCreate(false)
            // Forzar reload completo para que el ciclo siempre sea visible,
            // especialmente si el data del RPC vino null en el primer intento.
            window.location.reload()
          }}
        />
      )}

      {editingCycle && plan && (
        <EditMonthlyCycleModal
          childId={childId}
          plan={plan}
          cycle={editingCycle}
          enrolledProgram={enrolledProgram}
          onClose={() => setEditingCycle(null)}
          onSaved={(updated) => {
            setCycles((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
            setEditingCycle(null)
            router.refresh()
          }}
        />
      )}

      {extendingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">Prorrogar periodo de gracia</h3>
            <p className="text-xs text-fm-on-surface-variant">
              Mové la fecha límite de pago. El recargo por mora se medirá contra esta
              nueva fecha. Requiere una justificación.
            </p>
            <div className="space-y-2">
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Nueva fecha límite
              </label>
              <input
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Justificación
              </label>
              <textarea
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                rows={2}
                placeholder="Motivo de la prórroga"
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </div>
            {extendError && <p className="text-xs text-red-700">{extendError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtendingId(null)}
                disabled={isExtending}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExtend}
                disabled={isExtending}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
              >
                {isExtending ? 'Guardando…' : 'Prorrogar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">Marcar ciclo como pagado</h3>
            <p className="text-xs text-fm-on-surface-variant">
              Si el pago es posterior a la fecha de gracia, el sistema agrega
              automáticamente el recargo por mora (5% por cada 5 días).
            </p>
            <div className="space-y-2">
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Fecha de pago
              </label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Método
              </label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                Referencia (opcional)
              </label>
              <input
                type="text"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="recibo, n° transferencia"
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </div>
            {payError && <p className="text-xs text-red-700">{payError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingId(null)}
                disabled={isPaying}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={isPaying}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                {isPaying ? 'Guardando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
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

      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-fm-on-surface">Eliminar ciclo</h3>
            <p className="text-xs text-fm-on-surface-variant">
              Esto <b>borra por completo</b> el ciclo, su factura y las citas
              auto-generadas del mes que sigan <b>programadas</b> (las ya iniciadas
              o completadas se respetan). Útil para ciclos de prueba o errores.
              Esta acción <b>no se puede deshacer</b>; el mes quedará libre para
              volver a generarse.
            </p>
            {deleteError && <p className="text-xs text-red-700">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingId(null)
                  setDeleteError(null)
                }}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-700 text-white font-medium hover:bg-red-800 disabled:opacity-60"
              >
                {isDeleting ? 'Eliminando…' : 'Eliminar ciclo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
