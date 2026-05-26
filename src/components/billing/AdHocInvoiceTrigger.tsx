'use client'

import { useState } from 'react'
import { NewAdHocInvoiceModal } from './NewAdHocInvoiceModal'
import type { MorningProgram, ServiceCatalogItem } from '@/types/db'

interface Props {
  childId: string
  childName: string
  enrolledProgram: MorningProgram | null
  catalog: ServiceCatalogItem[]
}

/**
 * Botón pequeño "Nueva factura" que monta el modal NewAdHocInvoiceModal.
 * Se usa en la ficha del niño junto a MonthlyCyclesSection.
 */
export function AdHocInvoiceTrigger({ childId, childName, enrolledProgram, catalog }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-base">add</span>
        Nueva factura
      </button>
      <NewAdHocInvoiceModal
        open={open}
        onClose={() => setOpen(false)}
        childId={childId}
        childName={childName}
        enrolledProgram={enrolledProgram}
        catalog={catalog}
      />
    </>
  )
}
