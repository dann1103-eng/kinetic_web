'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { TherapistWorkScheduleBlock } from '@/types/db'
import { EditTherapistScheduleModal } from './EditTherapistScheduleModal'

interface TherapistRow {
  id: string
  full_name: string
  max_hours_per_week: number | null
  blocks: TherapistWorkScheduleBlock[]
}

interface Props {
  therapists: TherapistRow[]
}

const DAY_LABELS_SHORT: Record<number, string> = {
  1: 'L',
  2: 'M',
  3: 'X',
  4: 'J',
  5: 'V',
  6: 'S',
  0: 'D',
}

function trimSeconds(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

function totalHours(blocks: TherapistWorkScheduleBlock[]): number {
  let mins = 0
  for (const b of blocks) {
    if (!b.active) continue
    const [sh, sm] = b.start_time.split(':').map(Number)
    const [eh, em] = b.end_time.split(':').map(Number)
    mins += eh * 60 + em - (sh * 60 + sm)
  }
  return mins / 60
}

export function TherapistSchedulesList({ therapists }: Props) {
  const [editing, setEditing] = useState<TherapistRow | null>(null)

  return (
    <>
      <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest overflow-hidden">
        {therapists.length === 0 ? (
          <p className="p-6 text-center text-sm text-fm-on-surface-variant">
            No hay terapistas registrados.
          </p>
        ) : (
          therapists.map((t, idx) => {
            const total = totalHours(t.blocks)
            const exceeds = t.max_hours_per_week != null && total > t.max_hours_per_week
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  idx > 0 ? 'border-t border-fm-outline-variant/15' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-fm-on-surface">{t.full_name}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {t.blocks.length === 0 ? (
                      <span className="text-xs italic text-fm-on-surface-variant">
                        Sin horario configurado
                      </span>
                    ) : (
                      <>
                        <span className="text-xs tabular-nums font-semibold text-fm-on-surface-variant">
                          {total.toFixed(1).replace(/\.0$/, '')}h/sem
                        </span>
                        {t.max_hours_per_week != null && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              exceeds
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            tope {t.max_hours_per_week}h
                          </span>
                        )}
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                            const blocks = t.blocks.filter((b) => b.day_of_week === dow)
                            const has = blocks.length > 0
                            return (
                              <span
                                key={dow}
                                title={
                                  blocks.length > 0
                                    ? blocks
                                        .map(
                                          (b) =>
                                            `${trimSeconds(b.start_time)}-${trimSeconds(b.end_time)}`,
                                        )
                                        .join(', ')
                                    : 'No trabaja'
                                }
                                className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
                                  has
                                    ? 'bg-fm-primary/15 text-fm-primary'
                                    : 'bg-fm-surface-container text-fm-on-surface-variant/40'
                                }`}
                              >
                                {DAY_LABELS_SHORT[dow]}
                              </span>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/operacion/capacidad-terapistas?therapistFocus=${t.id}`}
                    className="text-xs text-fm-on-surface-variant hover:text-fm-primary"
                  >
                    Ver ocupación
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="text-sm font-semibold text-fm-primary hover:underline px-3 py-1.5 rounded-lg hover:bg-fm-primary/5"
                  >
                    Editar
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {editing && (
        <EditTherapistScheduleModal
          therapist={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
