'use client'

import { useEffect, useRef } from 'react'

interface SyncedScrollbarProps {
  /** Ref al contenedor con overflow-x-auto que se debe sincronizar. */
  targetRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Scrollbar horizontal "espejo" que se monta arriba del contenedor scrolleable
 * para que el usuario pueda hacer scroll horizontal sin tener que ir al fondo.
 * Sincroniza bidireccionalmente con el target via `scrollLeft`.
 */
export function SyncedScrollbar({ targetRef }: SyncedScrollbarProps) {
  const topRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef<'top' | 'bottom' | null>(null)

  useEffect(() => {
    const top = topRef.current
    const inner = innerRef.current
    const target = targetRef.current
    if (!top || !inner || !target) return

    // Sincronizar el ancho del scrollbar superior con el scrollWidth del target.
    const updateWidth = () => {
      if (innerRef.current && targetRef.current) {
        innerRef.current.style.width = `${targetRef.current.scrollWidth}px`
      }
    }
    updateWidth()

    const ro = new ResizeObserver(updateWidth)
    ro.observe(target)
    // También observar mutaciones en hijos (agregar/quitar columnas).
    const mo = new MutationObserver(updateWidth)
    mo.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })

    const onTopScroll = () => {
      if (syncingRef.current === 'bottom') return
      syncingRef.current = 'top'
      if (targetRef.current) targetRef.current.scrollLeft = top.scrollLeft
      // Reset en próximo frame
      requestAnimationFrame(() => {
        syncingRef.current = null
      })
    }
    const onBottomScroll = () => {
      if (syncingRef.current === 'top') return
      syncingRef.current = 'bottom'
      if (topRef.current && targetRef.current) topRef.current.scrollLeft = targetRef.current.scrollLeft
      requestAnimationFrame(() => {
        syncingRef.current = null
      })
    }

    top.addEventListener('scroll', onTopScroll, { passive: true })
    target.addEventListener('scroll', onBottomScroll, { passive: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
      top.removeEventListener('scroll', onTopScroll)
      target.removeEventListener('scroll', onBottomScroll)
    }
  }, [targetRef])

  return (
    <div
      ref={topRef}
      className="overflow-x-auto overflow-y-hidden h-3 mb-1 rounded-full bg-fm-surface-container-low/40"
      aria-hidden="true"
    >
      <div ref={innerRef} className="h-3" />
    </div>
  )
}
