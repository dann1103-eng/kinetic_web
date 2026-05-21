'use client'

import { useState } from 'react'
import { WaitlistTable } from './WaitlistTable'
import { WaitlistPipelineBoard } from './WaitlistPipelineBoard'
import type { IntakePhaseCatalogEntry, WaitlistEntry } from '@/types/db'

type ViewMode = 'pipeline' | 'table'

interface Props {
  entries: WaitlistEntry[]
  therapistsById: Record<string, string>
  familyIdByChildId?: Record<string, string>
  phaseCatalog: IntakePhaseCatalogEntry[]
}

const STORAGE_KEY = 'kinetic.waitlist.view'

/**
 * Toggle entre vista pipeline (kanban por sub-fase) y vista tabla. La
 * preferencia del usuario se guarda en localStorage. Default: pipeline.
 */
export function WaitlistViewSwitcher(props: Props) {
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'pipeline'
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'table' ? 'table' : 'pipeline'
  })

  function handleSetView(v: ViewMode) {
    setView(v)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, v)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-fm-surface-container-low rounded-full p-1 w-fit">
        <button
          type="button"
          onClick={() => handleSetView('pipeline')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            view === 'pipeline'
              ? 'bg-fm-surface-container-lowest text-fm-primary shadow-sm'
              : 'text-fm-on-surface-variant hover:text-fm-on-surface'
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            view_kanban
          </span>
          Pipeline
        </button>
        <button
          type="button"
          onClick={() => handleSetView('table')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            view === 'table'
              ? 'bg-fm-surface-container-lowest text-fm-primary shadow-sm'
              : 'text-fm-on-surface-variant hover:text-fm-on-surface'
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            table_rows
          </span>
          Tabla
        </button>
      </div>

      {view === 'pipeline' ? (
        <WaitlistPipelineBoard {...props} />
      ) : (
        <WaitlistTable {...props} />
      )}
    </div>
  )
}
