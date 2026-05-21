'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
 * Dropdown menu para avanzar a una sub-fase específica. Usa un portal
 * (position:fixed en document.body) para que nunca quede cortado por
 * contenedores con overflow:hidden/auto, independientemente de dónde se
 * use. Se abre hacia abajo o hacia arriba según el espacio disponible en
 * el viewport.
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
  const [dropW, setDropW] = useState(288)
  const [pos, setPos] = useState<{
    top?: number
    bottom?: number
    left: number
  } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Cerrar al hacer scroll (el portal queda flotante si no)
  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  function handleToggle() {
    if (open) { setOpen(false); return }
    if (!triggerRef.current) { setOpen(true); return }

    const rect = triggerRef.current.getBoundingClientRect()
    const GAP = 4
    const DROP_W = Math.min(288, window.innerWidth - 16)
    const MAX_DROP_H = Math.min(window.innerHeight * 0.6, 400)
    const spaceBelow = window.innerHeight - rect.bottom - GAP
    const spaceAbove = rect.top - GAP

    // Clamp left so the dropdown never overflows the viewport
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - DROP_W - 8))

    if (spaceBelow >= Math.min(MAX_DROP_H, 180) || spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + GAP, left })
    } else {
      setPos({ bottom: window.innerHeight - rect.top + GAP, left })
    }
    setDropW(DROP_W)
    setOpen(true)
  }

  const filtered = onlyWaitlistVisible
    ? catalog.filter((c) => c.is_waitlist_visible)
    : catalog
  const groups = groupPhaseCatalog(filtered)

  const dropdown =
    open && pos ? (
      <div
        ref={dropRef}
        style={{
          position: 'fixed',
          top: pos.top,
          bottom: pos.bottom,
          left: pos.left,
          zIndex: 9999,
          width: dropW,
        }}
        className="max-h-[60vh] overflow-y-auto rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest shadow-2xl"
      >
        {groups.map((g) => {
          const palette = PHASE_GROUP_COLORS[g.group_number as PhaseGroupNumber]
          return (
            <div
              key={g.group_number}
              className="border-b border-fm-outline-variant/10 last:border-0"
            >
              <div
                className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${palette.bg} ${palette.text}`}
              >
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
                        className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 hover:bg-fm-surface-container disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCurrent ? 'bg-fm-surface-container-low' : ''
                        }`}
                      >
                        <span className="font-mono text-[10px] text-fm-on-surface-variant mt-0.5">
                          {p.group_number}.{p.sub_order}
                        </span>
                        <span className="flex-1">
                          <span className="font-semibold text-fm-on-surface">
                            {p.label}
                            {p.is_optional && (
                              <span className="ml-1 text-[9px] uppercase text-fm-on-surface-variant">
                                opcional
                              </span>
                            )}
                          </span>
                          {isCurrent && (
                            <span className="ml-1 text-[10px] text-fm-primary">
                              · actual
                            </span>
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
    ) : null

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
      >
        {label}
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          arrow_drop_down
        </span>
      </button>
      {typeof document !== 'undefined' && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  )
}
