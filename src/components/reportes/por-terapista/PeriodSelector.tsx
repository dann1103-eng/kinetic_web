'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

interface Props {
  year: number
  month: number
  systemYear: number
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function PeriodSelector({ year, month, systemYear }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function update(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', String(nextYear))
    params.set('month', String(nextMonth))
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  const years: number[] = []
  for (let y = systemYear; y >= systemYear - 4; y--) years.push(y)

  return (
    <div className="flex items-end gap-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">Mes</span>
        <select
          value={month}
          onChange={(e) => update(year, parseInt(e.target.value, 10))}
          disabled={pending}
          className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-1.5 text-sm font-medium text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-50"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">Año</span>
        <select
          value={year}
          onChange={(e) => update(parseInt(e.target.value, 10), month)}
          disabled={pending}
          className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-1.5 text-sm font-medium text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-50"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
