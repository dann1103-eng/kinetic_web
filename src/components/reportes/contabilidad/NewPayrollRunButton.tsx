'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPayrollRun } from '@/app/actions/payroll'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function NewPayrollRunButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createPayrollRun({ year, month })
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
              <h2 className="text-lg font-extrabold text-fm-on-surface">Crear planilla mensual</h2>
              <p className="text-xs text-fm-on-surface-variant mt-1">
                Se generarán automáticamente ítems para todos los empleados con contrato activo, usando la configuración fiscal vigente.
              </p>
            </div>
            <div className="p-6 space-y-4">
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
