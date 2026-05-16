'use client'

import { useState } from 'react'
import { NewWaitlistEntryModal } from './NewWaitlistEntryModal'

interface Props {
  therapists: { id: string; full_name: string }[]
}

export function NewWaitlistEntryButton({ therapists }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fm-primary text-white text-sm font-semibold hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        Nueva entrada
      </button>
      <NewWaitlistEntryModal
        open={open}
        onClose={() => setOpen(false)}
        therapists={therapists}
      />
    </>
  )
}
