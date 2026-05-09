'use client'

import { useState } from 'react'
import { AbsenceRescheduleCard } from './AbsenceRescheduleCard'
import type { AbsenceRow } from '@/app/actions/absences'

interface TherapistOption {
  id: string
  full_name: string
  role: string
}

interface Props {
  rows: AbsenceRow[]
  therapists: TherapistOption[]
}

export function AbsenceRescheduleList({ rows: initial, therapists }: Props) {
  const [rows, setRows] = useState(initial)

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <AbsenceRescheduleCard
          key={row.absence.id}
          row={row}
          therapists={therapists}
          onResolved={(absenceId) =>
            setRows((prev) => prev.filter((r) => r.absence.id !== absenceId))
          }
        />
      ))}
    </div>
  )
}
