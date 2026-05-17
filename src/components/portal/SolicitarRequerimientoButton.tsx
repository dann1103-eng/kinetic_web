'use client'

import { useState } from 'react'
import { ClientRequestRequirementModal } from './ClientRequestRequirementModal'

export function SolicitarRequerimientoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-sm hover:shadow"
        style={{ background: 'linear-gradient(135deg, #00675c 0%, #4fa89c 100%)' }}
      >
        <span className="material-symbols-outlined text-base">add_task</span>
        Solicitar requerimiento
      </button>
      <ClientRequestRequirementModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
