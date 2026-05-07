'use client'

import { useEffect, useRef } from 'react'

/**
 * Hook de accesibilidad para modales/diálogos.
 *
 * Provee:
 *   - Auto-focus al primer elemento focusable cuando abre.
 *   - Focus trap: Tab/Shift+Tab quedan dentro del diálogo.
 *   - Escape cierra (configurable).
 *   - Restore focus al elemento que abrió el diálogo cuando cierra.
 *   - Bloquea scroll del body mientras está abierto.
 *
 * Uso:
 *   const dialogRef = useRef<HTMLDivElement>(null)
 *   useDialogA11y({ open, onClose: () => setOpen(false), ref: dialogRef })
 *
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
 *     ...
 *   </div>
 */
export function useDialogA11y(opts: {
  open: boolean
  onClose: () => void
  ref: React.RefObject<HTMLElement | null>
  /** Si false, Escape no cierra. Default true. */
  closeOnEscape?: boolean
  /** Si false, no auto-focus. Default true. */
  autoFocus?: boolean
}) {
  const { open, onClose, ref, closeOnEscape = true, autoFocus = true } = opts
  const triggerRef = useRef<HTMLElement | null>(null)

  // Restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
    } else if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [open])

  // Auto-focus + scroll lock + escape + tab trap
  useEffect(() => {
    if (!open || !ref.current) return
    const dialog = ref.current

    if (autoFocus) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (firstFocusable) firstFocusable.focus()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, ref, onClose, closeOnEscape, autoFocus])
}
