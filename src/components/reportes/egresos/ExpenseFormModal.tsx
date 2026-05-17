'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createExpense, updateExpense, type ExpenseInput } from '@/app/actions/expenses'
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_ORDER,
  type ExpenseCategory,
  type GeneralExpense,
} from '@/types/db'

interface Props {
  /** Si se pasa, modo edición. Si no, modo creación. */
  expense?: GeneralExpense
  onClose: () => void
}

export function ExpenseFormModal({ expense, onClose }: Props) {
  const router = useRouter()
  const isEdit = !!expense
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'servicios_publicos')
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState<string>(
    expense ? String(expense.amount_usd) : '',
  )
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  )
  const [paymentMethod, setPaymentMethod] = useState(expense?.payment_method ?? '')
  const [provider, setProvider] = useState(expense?.provider ?? '')
  const [invoiceReference, setInvoiceReference] = useState(expense?.invoice_reference ?? '')
  const [notes, setNotes] = useState(expense?.notes ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = parseFloat(amount)
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setError('Ingresá un monto válido mayor a cero.')
      return
    }
    if (!expenseDate) {
      setError('La fecha es obligatoria.')
      return
    }

    const input: ExpenseInput = {
      category,
      subcategory: subcategory.trim() || null,
      description: description.trim() || null,
      amountUsd: amountNum,
      expenseDate,
      paymentMethod: paymentMethod.trim() || null,
      provider: provider.trim() || null,
      invoiceReference: invoiceReference.trim() || null,
      notes: notes.trim() || null,
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateExpense(expense!.id, input)
        : await createExpense(input)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-2xl bg-fm-background shadow-xl my-8"
      >
        <div className="border-b border-fm-outline-variant/30 px-6 py-4">
          <h2 className="text-lg font-extrabold text-fm-on-surface">
            {isEdit ? 'Editar gasto' : 'Nuevo gasto'}
          </h2>
          <p className="text-xs text-fm-on-surface-variant mt-1">
            Registrá un gasto operativo (renta, servicios, transporte, etc.). Las planillas se agregan
            automáticamente y no van acá.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Categoría *
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                required
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              >
                {EXPENSE_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Sub-categoría
              </span>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="Ej: agua, luz, gasolina"
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Monto (USD) *
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Fecha del gasto *
              </span>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Descripción
              </span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Pago de luz mes de mayo"
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Método de pago
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              >
                <option value="">No especificado</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Proveedor
              </span>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Ej: ANDA, CAESS"
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Nº de factura / recibo
              </span>
              <input
                type="text"
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Notas
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {error && <p className="text-sm text-fm-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-fm-outline-variant/30 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-fm-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear gasto'}
          </button>
        </div>
      </form>
    </div>
  )
}
