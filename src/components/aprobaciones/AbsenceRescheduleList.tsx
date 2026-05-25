'use client'

import { useMemo, useState } from 'react'
import { AbsenceRescheduleCard } from './AbsenceRescheduleCard'
import { isAbsenceExpired } from '@/lib/domain/absence'
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
  const [filterTherapistId, setFilterTherapistId] = useState<string>('')

  // Solo terapistas que aparecen en al menos una ausencia pendiente.
  const therapistsInRows = useMemo(() => {
    const ids = new Set(rows.map((r) => r.absence.therapist_id).filter(Boolean) as string[])
    return therapists.filter((t) => ids.has(t.id))
  }, [rows, therapists])

  const visible = useMemo(() => {
    const filtered = filterTherapistId
      ? rows.filter((r) => r.absence.therapist_id === filterTherapistId)
      : rows
    return [...filtered].sort(
      (a, b) =>
        new Date(a.absence.reported_at).getTime() -
        new Date(b.absence.reported_at).getTime(),
    )
  }, [rows, filterTherapistId])

  const expiredCount = useMemo(
    () => visible.filter((r) => isAbsenceExpired(r.absence.reported_at)).length,
    [visible],
  )

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-fm-on-surface-variant">
          <b className="text-fm-on-surface">{visible.length}</b>{' '}
          {visible.length === 1 ? 'pendiente' : 'pendientes'}
          {expiredCount > 0 && (
            <>
              {' · '}
              <b className="text-rose-700">{expiredCount}</b>{' '}
              {expiredCount === 1 ? 'vencida' : 'vencidas'}
            </>
          )}
        </p>
        {therapistsInRows.length > 1 && (
          <select
            value={filterTherapistId}
            onChange={(e) => setFilterTherapistId(e.target.value)}
            className="rounded-md border border-fm-outline-variant/30 bg-fm-background text-fm-on-surface px-2 py-1 text-xs"
          >
            <option value="">Todos los terapistas</option>
            {therapistsInRows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-fm-on-surface-variant italic px-1">
          No hay pendientes con ese filtro.
        </p>
      ) : (
        visible.map((row) => (
          <AbsenceRescheduleCard
            key={row.absence.id}
            row={row}
            therapists={therapists}
            onResolved={(absenceId) =>
              setRows((prev) => prev.filter((r) => r.absence.id !== absenceId))
            }
          />
        ))
      )}
    </div>
  )
}
