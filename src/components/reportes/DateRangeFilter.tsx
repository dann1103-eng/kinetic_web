'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  paramFrom: string
  paramTo: string
  initialFrom: string
  initialTo: string
}

/**
 * Rango de fechas YYYY-MM-DD que actualiza dos search params del URL al hacer
 * click en "Aplicar". Otros params se preservan.
 */
export function DateRangeFilter({ paramFrom, paramTo, initialFrom, initialTo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  const dirty = from !== initialFrom || to !== initialTo

  function handleApply() {
    if (!from || !to) return
    if (from > to) return
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramFrom, from)
    params.set(paramTo, to)
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex items-end gap-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">
          Desde
        </span>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-sm font-medium text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">
          Hasta
        </span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-sm font-medium text-fm-on-surface focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
        />
      </label>
      <button
        type="button"
        onClick={handleApply}
        disabled={!dirty || isPending || !from || !to || from > to}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-1.5 text-xs font-bold text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Aplicar
      </button>
    </div>
  )
}
