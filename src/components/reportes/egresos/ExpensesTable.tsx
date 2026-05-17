'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteExpense } from '@/app/actions/expenses'
import { ExpenseFormModal } from './ExpenseFormModal'
import { fmtUsd } from '@/lib/domain/reports/expenses'
import {
  EXPENSE_CATEGORY_LABELS,
  type GeneralExpense,
} from '@/types/db'

interface Props {
  expenses: GeneralExpense[]
}

export function ExpensesTable({ expenses }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GeneralExpense | null>(null)
  const [creating, setCreating] = useState(false)

  function handleDelete(e: GeneralExpense) {
    if (!confirm(`¿Eliminar este gasto?\n\n${EXPENSE_CATEGORY_LABELS[e.category]}${e.subcategory ? ` · ${e.subcategory}` : ''}\n${fmtUsd(Number(e.amount_usd))} · ${e.expense_date}`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteExpense(e.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-extrabold text-fm-on-surface">
          Gastos registrados <span className="text-fm-on-surface-variant font-normal">({expenses.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Nuevo gasto
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-background p-12 text-center">
          <span className="material-symbols-outlined text-fm-on-surface-variant" style={{ fontSize: '48px' }}>
            receipt
          </span>
          <p className="mt-3 text-sm text-fm-on-surface-variant">
            Sin gastos registrados en el rango. Hacé click en &laquo;Nuevo gasto&raquo; para empezar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30 bg-fm-background">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container">
              <tr>
                <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Fecha</th>
                <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Categoría</th>
                <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Descripción</th>
                <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Proveedor</th>
                <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Monto</th>
                <th className="py-3 px-4 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-fm-outline-variant/20 hover:bg-fm-surface-container-low transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-fm-on-surface tabular-nums">{e.expense_date}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-fm-on-surface">
                      {EXPENSE_CATEGORY_LABELS[e.category]}
                    </div>
                    {e.subcategory && (
                      <div className="text-xs text-fm-on-surface-variant">{e.subcategory}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-fm-on-surface">
                    {e.description ?? <span className="text-fm-on-surface-variant italic">Sin descripción</span>}
                    {e.invoice_reference && (
                      <div className="text-xs text-fm-on-surface-variant mt-0.5">
                        Recibo: {e.invoice_reference}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-fm-on-surface-variant">
                    {e.provider ?? '—'}
                    {e.payment_method && (
                      <div className="text-xs capitalize">{e.payment_method}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface tabular-nums">
                    {fmtUsd(Number(e.amount_usd))}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        className="material-symbols-outlined text-fm-on-surface-variant hover:text-fm-primary transition-colors"
                        style={{ fontSize: '18px' }}
                        title="Editar"
                      >
                        edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        disabled={pending}
                        className="material-symbols-outlined text-fm-on-surface-variant hover:text-fm-error transition-colors disabled:opacity-50"
                        style={{ fontSize: '18px' }}
                        title="Eliminar"
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ExpenseFormModal onClose={() => setCreating(false)} />}
      {editing && <ExpenseFormModal expense={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
