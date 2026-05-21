'use client'

import { useState, useRef, useEffect } from 'react'
import { PHASE_GROUP_COLORS } from '@/types/db'
import type { IntakePhaseCatalogEntry, PhaseGroupNumber } from '@/types/db'
import { groupPhaseCatalog } from '@/lib/domain/intake-pipeline'

interface Props {
  catalog: IntakePhaseCatalogEntry[]
  currentCode: string | null
  /** Solo mostrar fases marcadas como visibles en waitlist (1-3). */
  onlyWaitlistVisible?: boolean
  disabled?: boolean
  onAdvance: (toCode: string) => void
  label?: string
}

/**
 * Dropdown menu para avanzar a una sub-fase específica. Muestra las fases
 * agrupadas por grupo con su paleta de color. Permite saltar pasos y
 * retroceder (la action de servidor valida los permisos).
 */
export function PhaseAdvanceMenu({
  catalog,
  currentCode,
  onlyWaitlistVisible = false,
  disabled = false,
  onAdvance,
  label = 'Avanzar a…',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filtered = onlyWaitlistVisible
    ? catalog.filter((c) => c.is_waitlist_visible)
    : catalog
  const groups = groupPhaseCatalog(filtered)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
      >
        {label}
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          arrow_drop_down
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 max-h-[60vh] overflow-y-auto rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest shadow-xl">
          {groups.map((g) => {
            const palette = PHASE_GROUP_COLORS[g.group_number as PhaseGroupNumber]
            return (
              <div key={g.group_number} className="border-b border-fm-outline-variant/10 last:border-0">
                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${palette.bg} ${palette.text}`}>
                  {g.group_number}. {g.group_name}
                </div>
                <ul>
                  {g.phases.map((p) => {
                    const isCurrent = p.code === currentCode
                    return (
                      <li key={p.code}>
                        <button
                          type="button"
                          disabled={isCurrent}
                          onClick={() => {
                            setOpen(false)
                            onAdvance(p.code)
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 hover:bg-fm-surface-container disabled:opacity-50 disabled:cursor-not-allowed ${isCurrent ? 'bg-fm-surface-container-low' : ''}`}
                        >
                          <span className="font-mono text-[10px] text-fm-on-surface-variant mt-0.5">
                            {p.group_number}.{p.sub_order}
                          </span>
                          <span className="flex-1">
                            <span className="font-semibold text-fm-on-surface">
                              {p.label}
                              {p.is_optional && (
                                <span className="ml-1 text-[9px] uppercase text-fm-on-surface-variant">opcional</span>
                              )}
                            </span>
                            {isCurrent && (
                              <span className="ml-1 text-[10px] text-fm-primary">· actual</span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
