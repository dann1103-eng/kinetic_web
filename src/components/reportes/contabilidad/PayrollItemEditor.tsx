'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayrollItem, removePayrollItem } from '@/app/actions/payroll'
import { fmtUsd } from '@/lib/domain/payroll/calculation'
import type { PayrollItem } from '@/types/db'

interface Props {
  item: PayrollItem & { user: { id: string; full_name: string; email: string; role: string } | null }
  editable: boolean
}

export function PayrollItemEditor({ item, editable }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [base, setBase] = useState(Number(item.base_salary_usd))
  const [extraHours, setExtraHours] = useState(Number(item.extra_hours))
  const [extraRate, setExtraRate] = useState(Number(item.extra_hours_rate_usd ?? 0))
  const [bonus, setBonus] = useState(Number(item.bonus_usd))
  const [otherDed, setOtherDed] = useState(Number(item.other_deductions_usd))
  const [notes, setNotes] = useState(item.notes ?? '')

  const dirty =
    base !== Number(item.base_salary_usd) ||
    extraHours !== Number(item.extra_hours) ||
    extraRate !== Number(item.extra_hours_rate_usd ?? 0) ||
    bonus !== Number(item.bonus_usd) ||
    otherDed !== Number(item.other_deductions_usd) ||
    notes !== (item.notes ?? '')

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updatePayrollItem({
        itemId: item.id,
        baseSalaryUsd: base,
        extraHours,
        extraHoursRateUsd: extraRate,
        bonusUsd: bonus,
        otherDeductionsUsd: otherDed,
        notes,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove() {
    if (!confirm(`¿Quitar a ${item.user?.full_name ?? 'este empleado'} de la planilla?`)) return
    setError(null)
    startTransition(async () => {
      const res = await removePayrollItem(item.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <tr className="border-t border-fm-outline-variant/20 hover:bg-fm-surface-container-low">
      <td className="py-3 px-4">
        <div className="font-semibold text-fm-on-surface">{item.user?.full_name ?? '—'}</div>
        <div className="text-xs text-fm-on-surface-variant capitalize">{item.user?.role.replace('_', ' ')}</div>
      </td>
      <td className="py-3 px-4 text-right">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min={0}
            value={base}
            onChange={(e) => setBase(parseFloat(e.target.value) || 0)}
            className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm font-medium"
          />
        ) : (
          fmtUsd(Number(item.base_salary_usd))
        )}
      </td>
      <td className="py-3 px-4 text-right text-fm-on-surface">
        {fmtUsd(Number(item.gross_total_usd))}
      </td>
      <td className="py-3 px-4 text-right text-rose-700">
        −{fmtUsd(Number(item.total_deductions_usd))}
      </td>
      <td className="py-3 px-4 text-right font-extrabold" style={{ color: '#00675c' }}>
        {fmtUsd(Number(item.net_pay_usd))}
      </td>
      <td className="py-3 px-4 text-right">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="material-symbols-outlined text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          style={{ fontSize: '18px' }}
          aria-label={expanded ? 'Contraer' : 'Expandir'}
        >
          {expanded ? 'expand_less' : 'expand_more'}
        </button>
      </td>

      {expanded && (
        <td colSpan={6} className="px-4 pb-4 pt-0 bg-fm-surface-container-low">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-2">
                Entradas
              </h4>
              <div className="space-y-2 text-sm">
                {editable && (
                  <>
                    <Field label="Horas extras">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={extraHours}
                        onChange={(e) => setExtraHours(parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm"
                      />
                    </Field>
                    <Field label="Tarifa hora extra">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={extraRate}
                        onChange={(e) => setExtraRate(parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm"
                      />
                    </Field>
                    <Field label="Bono / pago extra">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={bonus}
                        onChange={(e) => setBonus(parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm"
                      />
                    </Field>
                    <Field label="Otras deducciones">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={otherDed}
                        onChange={(e) => setOtherDed(parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm"
                      />
                    </Field>
                  </>
                )}
                {!editable && (
                  <>
                    <ReadOnly label="Horas extras" value={`${item.extra_hours}`} />
                    <ReadOnly label="Monto horas extras" value={fmtUsd(Number(item.extra_hours_amount_usd))} />
                    <ReadOnly label="Bono" value={fmtUsd(Number(item.bonus_usd))} />
                    <ReadOnly label="Otras deducciones" value={fmtUsd(Number(item.other_deductions_usd))} />
                  </>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-2">
                Cálculo
              </h4>
              <div className="space-y-1 text-sm">
                <ReadOnly label="Bruto" value={fmtUsd(Number(item.gross_total_usd))} />
                <ReadOnly label="ISSS empleado" value={`−${fmtUsd(Number(item.isss_employee_usd))}`} />
                <ReadOnly label="AFP empleado" value={`−${fmtUsd(Number(item.afp_employee_usd))}`} />
                <ReadOnly label="ISR" value={`−${fmtUsd(Number(item.isr_usd))}`} />
                <ReadOnly label="Neto" value={fmtUsd(Number(item.net_pay_usd))} bold />
                <div className="mt-2 pt-2 border-t border-fm-outline-variant/30 text-xs text-fm-on-surface-variant">
                  Costo patrono: {fmtUsd(Number(item.employer_cost_usd))}
                  <br />
                  ISSS patrono: {fmtUsd(Number(item.isss_employer_usd))} · AFP patrono: {fmtUsd(Number(item.afp_employer_usd))}
                </div>
              </div>
            </div>
          </div>

          {editable && (
            <div className="mt-4">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                Notas internas
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && <p className="mt-2 text-xs text-fm-error">{error}</p>}

          {editable && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handleRemove}
                disabled={pending}
                className="text-xs font-bold text-rose-700 hover:underline disabled:opacity-50"
              >
                Quitar de la planilla
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || pending}
                className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {item.signed_at && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900">
              ✓ Firmado por el empleado el {new Date(item.signed_at).toLocaleString('es-SV')}
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fm-on-surface-variant">{label}</span>
      {children}
    </div>
  )
}

function ReadOnly({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fm-on-surface-variant">{label}</span>
      <span className={bold ? 'font-extrabold text-fm-on-surface' : 'text-fm-on-surface'}>
        {value}
      </span>
    </div>
  )
}
