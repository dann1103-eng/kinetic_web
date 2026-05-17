'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateUserSalary } from '@/app/actions/payroll'
import { fmtUsd } from '@/lib/domain/payroll/calculation'
import {
  CONTRACT_TYPE_LABELS,
  AFP_PROVIDER_LABELS,
  type PayrollContractType,
  type AfpProvider,
} from '@/types/db'

interface UserRow {
  id: string
  full_name: string
  email: string
  role: string
  monthly_salary_usd: number | null
  hourly_rate_usd: number | null
  contract_type: PayrollContractType
  dui: string | null
  isss_number: string | null
  afp_number: string | null
  afp_provider: AfpProvider | null
  hire_date: string | null
}

interface Props {
  user: UserRow
}

export function UserSalaryRow({ user }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [monthly, setMonthly] = useState(user.monthly_salary_usd ?? '')
  const [hourly, setHourly] = useState(user.hourly_rate_usd ?? '')
  const [contract, setContract] = useState<PayrollContractType>(user.contract_type)
  const [dui, setDui] = useState(user.dui ?? '')
  const [isssNum, setIsssNum] = useState(user.isss_number ?? '')
  const [afpNum, setAfpNum] = useState(user.afp_number ?? '')
  const [afpProv, setAfpProv] = useState<AfpProvider | ''>(user.afp_provider ?? '')
  const [hireDate, setHireDate] = useState(user.hire_date ?? '')

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateUserSalary({
        userId: user.id,
        monthlySalaryUsd: monthly === '' ? null : Number(monthly),
        hourlyRateUsd: hourly === '' ? null : Number(hourly),
        contractType: contract,
        dui: dui.trim() || null,
        isssNumber: isssNum.trim() || null,
        afpNumber: afpNum.trim() || null,
        afpProvider: afpProv || null,
        hireDate: hireDate || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setExpanded(false)
      router.refresh()
    })
  }

  return (
    <>
      <tr className="border-t border-fm-outline-variant/20 hover:bg-fm-surface-container-low transition-colors">
        <td className="py-3 px-4">
          <div className="font-semibold text-fm-on-surface">{user.full_name}</div>
          <div className="text-xs text-fm-on-surface-variant">{user.email}</div>
        </td>
        <td className="py-3 px-4 text-fm-on-surface capitalize">{user.role.replace('_', ' ')}</td>
        <td className="py-3 px-4 text-fm-on-surface">{CONTRACT_TYPE_LABELS[user.contract_type]}</td>
        <td className="py-3 px-4 text-right font-bold text-fm-on-surface">
          {user.monthly_salary_usd != null ? fmtUsd(user.monthly_salary_usd) : '—'}
        </td>
        <td className="py-3 px-4 text-right text-fm-on-surface-variant">
          {user.hourly_rate_usd != null ? fmtUsd(user.hourly_rate_usd) : '—'}
        </td>
        <td className="py-3 px-4 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-bold text-fm-primary hover:underline"
          >
            {expanded ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-fm-surface-container-low border-t border-fm-outline-variant/20">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <FieldSelect
                label="Tipo de contrato"
                value={contract}
                onChange={(v) => setContract(v as PayrollContractType)}
                options={[
                  { value: 'mensual_fijo', label: 'Mensual fijo' },
                  { value: 'por_hora', label: 'Por hora' },
                  { value: 'sin_contrato', label: 'Sin contrato' },
                ]}
              />
              <FieldNumber label="Salario mensual (USD)" value={monthly} onChange={setMonthly} step="0.01" />
              <FieldNumber label="Tarifa por hora (USD)" value={hourly} onChange={setHourly} step="0.01" />
              <FieldText label="DUI" value={dui} onChange={setDui} placeholder="00000000-0" />
              <FieldText label="Nº ISSS" value={isssNum} onChange={setIsssNum} />
              <FieldText label="Nº AFP" value={afpNum} onChange={setAfpNum} />
              <FieldSelect
                label="AFP"
                value={afpProv}
                onChange={(v) => setAfpProv(v as AfpProvider | '')}
                options={[
                  { value: '', label: 'No especificada' },
                  ...Object.entries(AFP_PROVIDER_LABELS).map(([v, label]) => ({ value: v, label })),
                ]}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                  Fecha de contratación
                </span>
                <input
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-fm-error">{error}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FieldNumber({ label, value, onChange, step }: {
  label: string
  value: number | string
  onChange: (v: number | string) => void
  step: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
      />
    </label>
  )
}

function FieldText({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
      />
    </label>
  )
}

function FieldSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
