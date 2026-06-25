'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPayrollRun } from '@/app/actions/payroll'
import { PAYROLL_TYPE_LABELS, type PayrollType } from '@/types/db'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const PAYROLL_TYPES: PayrollType[] = ['normal', 'servicios_profesionales']

export function NewPayrollRunButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [payrollType, setPayrollType] = useState<PayrollType>('normal')
  // '' = mensual; '1'/'2' = quincena.
  const [periodHalf, setPeriodHalf] = useState<'' | '1' | '2'>('')

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createPayrollRun({
        year,
        month,
        payrollType,
        periodHalf: periodHalf === '' ? null : (Number(periodHalf) as 1 | 2),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.push(`/reportes/contabilidad/planillas/${res.run.id}`)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        Nueva planilla
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-fm-background shadow-xl">
            <div className="border-b border-fm-outline-variant/30 px-6 py-4">
              <h2 className="text-lg font-extrabold text-fm-on-surface">Crear planilla</h2>
              <p className="text-xs text-fm-on-surface-variant mt-1">
                Se generarán automáticamente ítems para los empleados que pertenecen a la planilla elegida, usando la configuración fiscal vigente.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Tipo de planilla</span>
                <select
                  value={payrollType}
                  onChange={(e) => setPayrollType(e.target.value as PayrollType)}
                  className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
                >
                  {PAYROLL_TYPES.map((t) => (
                    <option key={t} value={t}>{PAYROLL_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <span className="text-[11px] text-fm-on-surface-variant">
                  {payrollType === 'servicios_profesionales'
                    ? 'Honorarios: solo retención de renta. Toma terapias completadas × costo (extras para quienes también están en la normal).'
                    : 'Sueldo fijo con deducciones completas (ISSS/AFP/ISR) y aportes patronales.'}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Año</span>
                  <input
                    type="number"
                    value={year}
                    min={2020}
                    max={2100}
                    onChange={(e) => setYear(parseInt(e.target.value, 10) || now.getFullYear())}
                    className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Mes</span>
                  <select
                    value={month}
                    onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                    className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Período</span>
                <select
                  value={periodHalf}
                  onChange={(e) => setPeriodHalf(e.target.value as '' | '1' | '2')}
                  className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
                >
                  <option value="">Mensual (todo el mes)</option>
                  <option value="1">1ª quincena (1–15)</option>
                  <option value="2">2ª quincena (16–fin)</option>
                </select>
                <span className="text-[11px] text-fm-on-surface-variant">
                  En quincenal, el sueldo fijo / base SP se prorratea a la mitad y las terapias se cuentan solo dentro de esa quincena.
                </span>
              </label>
              {error && <p className="text-sm text-fm-error">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-fm-outline-variant/30 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={pending}
                className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {pending ? 'Creando…' : 'Crear planilla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
