'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SessionReportModal } from './SessionReportModal'
import type { SessionReport } from '@/types/db'

interface Props {
  report: SessionReport
  childName: string
  /**
   * Si true, este botón actúa como "Llenar reporte" pendiente.
   * Si false, simplemente "Editar" (rejected o admin override).
   */
  pending?: boolean
}

/**
 * Botón pequeño que abre el SessionReportModal para un reporte específico.
 * Pensado para usarse en ChildSessionReportsHistory cuando el reporte está
 * en draft o rejected y la terapista (o admin/coord) necesita completarlo.
 */
export function EditSessionReportButton({ report: initialReport, childName, pending }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(initialReport)

  const isUrgent = pending || report.status === 'rejected'
  const label = report.status === 'draft' ? 'Llenar reporte' : report.status === 'rejected' ? 'Corregir' : 'Editar'

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Evitar que el <details> se abra/cierre al hacer click
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors ${
          isUrgent
            ? 'bg-fm-error text-white hover:bg-fm-error/90'
            : 'bg-fm-primary/10 text-fm-primary hover:bg-fm-primary/20'
        }`}
      >
        {label}
      </button>
      {open && (
        <SessionReportModal
          open={open}
          onOpenChange={setOpen}
          report={report}
          childName={childName}
          onReportUpdated={(updated) => {
            setReport(updated)
            router.refresh()
          }}
          onDeleted={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
