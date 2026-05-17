'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

interface Props {
  /** Nombre del search param a actualizar. */
  paramName: string
  /** Valor actualmente seleccionado. */
  value: number
  /** Rango de años a mostrar (inclusivo). */
  fromYear: number
  toYear: number
  label?: string
}

/**
 * Selector de año que actualiza un search param específico del URL.
 * Otros params se preservan. Causa re-render del server component padre.
 */
export function YearFilterSelect({ paramName, value, fromYear, toYear, label = 'Año' }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const years: number[] = []
  for (let y = toYear; y >= fromYear; y--) years.push(y)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, next)
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </span>
      <select
        value={value}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-sm font-medium text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/30 disabled:opacity-50"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </label>
  )
}
