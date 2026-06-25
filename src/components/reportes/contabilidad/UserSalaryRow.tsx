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
  professional_services_base_usd: number | null
  hourly_rate_usd: number | null
  contract_type: PayrollContractType
  in_normal_payroll: boolean
  in_professional_services_payroll: boolean
  dui: string | null
  isss_number: string | null
  afp_number: string | null
  afp_provider: AfpProvider | null
  hire_date: string | null
  bank_name: string | null
  account_type: string | null
  account_number: string | null
  nit: string | null
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
  const [spBase, setSpBase] = useState(user.professional_services_base_usd ?? '')
  const [hourly, setHourly] = useState(user.hourly_rate_usd ?? '')
  const [contract, setContract] = useState<PayrollContractType>(user.contract_type)
  const [inNormal, setInNormal] = useState<boolean>(user.in_normal_payroll)
  const [inSp, setInSp] = useState<boolean>(user.in_professional_services_payroll)
  const [dui, setDui] = useState(user.dui ?? '')
  const [isssNum, setIsssNum] = useState(user.isss_number ?? '')
  const [afpNum, setAfpNum] = useState(user.afp_number ?? '')
  const [afpProv, setAfpProv] = useState<AfpProvider | ''>(user.afp_provider ?? '')
  const [hireDate, setHireDate] = useState(user.hire_date ?? '')
  const [bankName, setBankName] = useState(user.bank_name ?? '')
  const [accountType, setAccountType] = useState(user.account_type ?? '')
  const [accountNumber, setAccountNumber] = useState(user.account_number ?? '')
  const [nit, setNit] = useState(user.nit ?? '')

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateUserSalary({
        userId: user.id,
        monthlySalaryUsd: monthly === '' ? null : Number(monthly),
        professionalServicesBaseUsd: spBase === '' ? null : Number(spBase),
        hourlyRateUsd: hourly === '' ? null : Number(hourly),
        contractType: contract,
        inNormalPayroll: inNormal,
        inProfessionalServicesPayroll: inSp,
        dui: dui.trim() || null,
        isssNumber: isssNum.trim() || null,
        afpNumber: afpNum.trim() || null,
        afpProvider: afpProv || null,
        hireDate: hireDate || null,
        bankName: bankName.trim() || null,
        accountType: accountType.trim() || null,
        accountNumber: accountNumber.trim() || null,
        nit: nit.trim() || null,
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
        <td className="py-3 px-4 text-fm-on-surface">
          <div>{CONTRACT_TYPE_LABELS[user.contract_type]}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {user.in_normal_payroll && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-teal-100 text-teal-900">Normal</span>
            )}
            {user.in_professional_services_payroll && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-violet-100 text-violet-900">Serv. prof.</span>
            )}
            {!user.in_normal_payroll && !user.in_professional_services_payroll && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-100 text-slate-500">Ninguna</span>
            )}
          </div>
        </td>
        <td className="py-3 px-4 text-right font-bold text-fm-on-surface">
          {user.monthly_salary_usd != null ? fmtUsd(user.monthly_salary_usd) : '—'}
        </td>
        <td className="py-3 px-4 text-right text-fm-on-surface-variant">
          {user.professional_services_base_usd != null ? fmtUsd(user.professional_services_base_usd) : '—'}
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
          <td colSpan={7} className="px-4 py-4">
            <div className="mb-3 rounded-lg border border-fm-outline-variant/30 bg-fm-background p-3">
              <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Pertenencia a planillas
              </span>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm text-fm-on-surface">
                  <input
                    type="checkbox"
                    checked={inNormal}
                    onChange={(e) => setInNormal(e.target.checked)}
                    className="rounded border-fm-outline-variant"
                  />
                  Entra a planilla normal (sueldo fijo, ISSS/AFP/ISR)
                </label>
                <label className="flex items-center gap-2 text-sm text-fm-on-surface">
                  <input
                    type="checkbox"
                    checked={inSp}
                    onChange={(e) => setInSp(e.target.checked)}
                    className="rounded border-fm-outline-variant"
                  />
                  Entra a servicios profesionales (honorarios, solo ISR)
                </label>
              </div>
              <p className="mt-2 text-[11px] text-fm-on-surface-variant">
                Marcá ambas para quien recibe sueldo fijo y además se le pagan extras/sábados aparte.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <FieldSelect
                label="Tipo de contrato"
                value={contract}
                onChange={(v) => setContract(v as PayrollContractType)}
                options={[
                  { value: 'mensual_fijo', label: 'Mensual fijo' },
                  { value: 'por_terapias', label: 'Por terapias' },
                  { value: 'sin_contrato', label: 'Sin contrato' },
                ]}
              />
              <FieldNumber label="Salario mensual (USD) · planilla normal" value={monthly} onChange={setMonthly} step="0.01" />
              <FieldNumber label="Base mensual (USD) · servicios profesionales" value={spBase} onChange={setSpBase} step="0.01" />
              <FieldNumber label="Tarifa por hora (USD, opcional)" value={hourly} onChange={setHourly} step="0.01" />
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
              <FieldText label="Banco" value={bankName} onChange={setBankName} placeholder="Ej: Banco Agrícola" />
              <FieldText label="Tipo de cuenta" value={accountType} onChange={setAccountType} placeholder="Ahorro / Corriente" />
              <FieldText label="Nº de cuenta" value={accountNumber} onChange={setAccountNumber} />
              <FieldText label="NIT" value={nit} onChange={setNit} placeholder="0000-000000-000-0" />
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
