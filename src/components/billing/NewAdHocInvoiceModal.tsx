'use client'

/**
 * Modal "Nueva factura" — items sueltos del service_catalog.
 *
 * Wrapper delgado alrededor de AdHocInvoiceBuilder. Se abre desde la ficha
 * del niño (AdHocInvoiceTrigger). El builder maneja todo el armado de la
 * factura; este componente solo aporta el chrome del modal + el header con
 * el nombre del niño.
 */

import { useRouter } from 'next/navigation'
import { AdHocInvoiceBuilder } from './AdHocInvoiceBuilder'
import type { MorningProgram, ServiceCatalogItem } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  childId: string
  childName: string
  enrolledProgram: MorningProgram | null
  catalog: ServiceCatalogItem[]
}

export function NewAdHocInvoiceModal({
  open,
  onClose,
  childId,
  childName,
  enrolledProgram,
  catalog,
}: Props) {
  const router = useRouter()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fm-surface-container-lowest text-fm-on-surface w-full max-w-4xl rounded-2xl shadow-xl border border-fm-outline-variant/30 my-8 flex flex-col max-h-[calc(100vh-4rem)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-fm-outline-variant/20 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold">Nueva factura</h2>
            <p className="text-xs text-fm-on-surface-variant">
              {childName}
              {enrolledProgram && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 text-[10px] font-bold uppercase">
                  precio BK
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-fm-on-surface-variant hover:text-fm-on-surface min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <AdHocInvoiceBuilder
            childId={childId}
            enrolledProgram={enrolledProgram}
            catalog={catalog}
            onCreated={() => {
              router.refresh()
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
