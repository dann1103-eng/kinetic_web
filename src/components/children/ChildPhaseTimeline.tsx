'use client'

import { useEffect, useState } from 'react'
import { getChildPhaseHistory } from '@/app/actions/intake-pipeline'
import type {
  ChildPhaseHistoryEntry,
  IntakePhaseCatalogEntry,
} from '@/types/db'
import { PhaseChip } from '@/components/pipeline/PhaseChip'

interface Props {
  childId: string
  phaseCatalog: IntakePhaseCatalogEntry[]
  authorNamesById?: Record<string, string>
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Lista vertical de transiciones de fase de un niño. Lee desde
 * `child_phase_history` vía server action y muestra cada entry como
 * `[from] → [to]` con autor + fecha + notas.
 */
export function ChildPhaseTimeline({
  childId,
  phaseCatalog,
  authorNamesById = {},
}: Props) {
  const [entries, setEntries] = useState<ChildPhaseHistoryEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getChildPhaseHistory(childId).then((rows) => {
      if (cancelled) return
      setEntries(rows)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [childId])

  const catalogByCode: Record<string, IntakePhaseCatalogEntry> = {}
  for (const p of phaseCatalog) catalogByCode[p.code] = p

  if (!loaded) {
    return <p className="text-xs italic text-fm-on-surface-variant">Cargando historial…</p>
  }
  if (entries.length === 0) {
    return (
      <p className="text-xs italic text-fm-on-surface-variant">
        Aún no hay cambios registrados de fase.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const from = entry.from_phase_code ? catalogByCode[entry.from_phase_code] : null
        const to = catalogByCode[entry.to_phase_code]
        const author = entry.changed_by_user_id
          ? authorNamesById[entry.changed_by_user_id] ?? 'Sistema'
          : 'Sistema'
        return (
          <li
            key={entry.id}
            className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-3 space-y-1"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {from ? (
                <>
                  <PhaseChip phase={from} />
                  <span className="material-symbols-outlined text-fm-on-surface-variant" style={{ fontSize: '16px' }}>
                    arrow_forward
                  </span>
                </>
              ) : (
                <span className="text-[11px] italic text-fm-on-surface-variant">
                  (inicio)
                </span>
              )}
              <PhaseChip phase={to ?? null} />
            </div>
            <p className="text-[11px] text-fm-on-surface-variant">
              {author} · {formatDateTime(entry.changed_at)}
            </p>
            {entry.notes && (
              <p className="text-xs text-fm-on-surface italic">{entry.notes}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
