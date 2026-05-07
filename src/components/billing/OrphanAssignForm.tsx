'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { assignOrphanPayment } from '@/app/actions/invoices'

interface InvoiceOption {
  id: string
  invoiceNumber: string
  total: number
  currency: string
  issueDate: string
  clientName: string
}

interface Props {
  eventId: string
  invoices: InvoiceOption[]
}

export function OrphanAssignForm({ eventId, invoices }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [invoiceId, setInvoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!invoiceId) { setError('Selecciona una factura'); return }
    setError(null)
    start(async () => {
      const r = await assignOrphanPayment({ eventId, invoiceId })
      if ('error' in r) {
        setError(r.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2 min-w-[260px]">
      <select
        value={invoiceId}
        onChange={(e) => setInvoiceId(e.target.value)}
        className="w-full py-1.5 px-2 text-xs bg-fm-background border border-fm-surface-container-high rounded-lg text-fm-on-surface focus:outline-none focus:border-fm-primary"
      >
        <option value="">— Seleccionar factura —</option>
        {invoices.map(inv => (
          <option key={inv.id} value={inv.id}>
            {inv.invoiceNumber} · {inv.clientName} · {inv.currency} {inv.total.toFixed(2)}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={pending || !invoiceId}
        onClick={submit}
        className="w-full rounded-xl text-white text-xs"
        style={{ background: '#1FA4DA' }}
      >
        {pending ? 'Asignando…' : 'Asignar pago'}
      </Button>
      {error && <p className="text-[11px] text-fm-error">{error}</p>}
    </div>
  )
}
