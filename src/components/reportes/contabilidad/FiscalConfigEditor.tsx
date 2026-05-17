'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateActiveFiscalConfig } from '@/app/actions/payroll'
import type { IsrBracket, PayrollFiscalConfig } from '@/types/db'

interface Props {
  config: PayrollFiscalConfig
  canEdit: boolean
}

export function FiscalConfigEditor({ config, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [isssEmp, setIsssEmp] = useState(Number(config.isss_employee_rate))
  const [isssPat, setIsssPat] = useState(Number(config.isss_employer_rate))
  const [isssCap, setIsssCap] = useState(Number(config.isss_cap_salary_usd))
  const [afpEmp, setAfpEmp] = useState(Number(config.afp_employee_rate))
  const [afpPat, setAfpPat] = useState(Number(config.afp_employer_rate))
  const [afpCap, setAfpCap] = useState<number | ''>(
    config.afp_cap_salary_usd != null ? Number(config.afp_cap_salary_usd) : '',
  )
  const [brackets, setBrackets] = useState<IsrBracket[]>(
    (config.isr_brackets_json as IsrBracket[]).map((b) => ({ ...b })),
  )
  const [notes, setNotes] = useState(config.notes ?? '')

  function updateBracket(i: number, patch: Partial<IsrBracket>) {
    setBrackets((arr) => arr.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateActiveFiscalConfig({
        isssEmployeeRate: isssEmp,
        isssEmployerRate: isssPat,
        isssCapSalaryUsd: isssCap,
        afpEmployeeRate: afpEmp,
        afpEmployerRate: afpPat,
        afpCapSalaryUsd: afpCap === '' ? null : Number(afpCap),
        isrBrackets: brackets,
        notes: notes.trim() || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-background p-6 space-y-6">
      <div>
        <h3 className="text-base font-extrabold text-fm-on-surface">Configuración fiscal vigente</h3>
        <p className="text-xs text-fm-on-surface-variant mt-1">
          Activa desde {config.effective_from}. Los cambios crean una nueva versión activa desde hoy y no afectan planillas selladas.
        </p>
      </div>

      <section>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-3">
          ISSS — Seguro Social
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <RateField label="Empleado (%)" value={isssEmp} onChange={setIsssEmp} disabled={!canEdit} />
          <RateField label="Patrono (%)" value={isssPat} onChange={setIsssPat} disabled={!canEdit} />
          <NumberField label="Tope salarial (USD)" value={isssCap} onChange={setIsssCap} disabled={!canEdit} />
        </div>
      </section>

      <section>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-3">
          AFP — Sistema de Pensiones
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <RateField label="Empleado (%)" value={afpEmp} onChange={setAfpEmp} disabled={!canEdit} />
          <RateField label="Patrono (%)" value={afpPat} onChange={setAfpPat} disabled={!canEdit} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
              Tope IBC (USD) · vacío = sin tope
            </span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={afpCap}
              disabled={!canEdit}
              onChange={(e) => setAfpCap(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium disabled:opacity-60"
            />
          </label>
        </div>
      </section>

      <section>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-3">
          ISR — Renta mensual asalariados
        </h4>
        <div className="overflow-x-auto rounded-xl border border-fm-outline-variant/30">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">#</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Desde (USD)</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Hasta (USD)</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Tasa</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Cuota fija</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Resta de base</th>
              </tr>
            </thead>
            <tbody>
              {brackets.map((b, i) => (
                <tr key={i} className="border-t border-fm-outline-variant/20">
                  <td className="px-3 py-2 text-fm-on-surface-variant">{i + 1}</td>
                  <td className="px-3 py-2 text-right">
                    <SmallNum value={b.from} onChange={(v) => updateBracket(i, { from: v })} disabled={!canEdit} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SmallNum
                      value={b.to ?? ''}
                      onChange={(v) => updateBracket(i, { to: v === 0 ? null : v })}
                      disabled={!canEdit}
                      placeholder="∞"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SmallNum value={b.rate} onChange={(v) => updateBracket(i, { rate: v })} step="0.01" disabled={!canEdit} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SmallNum value={b.fixed} onChange={(v) => updateBracket(i, { fixed: v })} disabled={!canEdit} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SmallNum value={b.baseSubtract} onChange={(v) => updateBracket(i, { baseSubtract: v })} disabled={!canEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Notas</span>
          <textarea
            value={notes}
            disabled={!canEdit}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </section>

      {error && <p className="text-sm text-fm-error">{error}</p>}

      {canEdit && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-lg bg-fm-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Crear nueva versión activa'}
          </button>
        </div>
      )}
    </div>
  )
}

function RateField({ label, value, onChange, disabled }: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  // El rate se guarda como decimal (0.03), pero se muestra como % (3)
  const display = (value * 100).toFixed(2).replace(/\.00$/, '')
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">{label}</span>
      <input
        type="number"
        step="0.01"
        min={0}
        max={100}
        value={display}
        disabled={disabled}
        onChange={(e) => onChange((parseFloat(e.target.value) || 0) / 100)}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium disabled:opacity-60"
      />
    </label>
  )
}

function NumberField({ label, value, onChange, disabled }: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">{label}</span>
      <input
        type="number"
        step="0.01"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium disabled:opacity-60"
      />
    </label>
  )
}

function SmallNum({ value, onChange, step = '0.01', disabled, placeholder }: {
  value: number | string
  onChange: (v: number) => void
  step?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-24 rounded border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-right text-sm font-medium disabled:opacity-60"
    />
  )
}
