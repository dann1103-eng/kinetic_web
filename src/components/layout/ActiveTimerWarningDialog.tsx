'use client'

interface ActiveTimerWarningDialogProps {
  open: boolean
  /** Nombre/título del timer activo, e.g. "Reel para Nike" */
  timerLabel: string | null
  /** Tipo de pausa que el usuario intentó marcar */
  breakType: 'lunch' | 'away' | null
  onDismiss: () => void
}

/**
 * Diálogo bloqueante que aparece cuando el usuario intenta marcar
 * Almuerzo/Away con un timer de requerimiento o administrativo activo.
 * No finaliza la jornada — solo avisa; el usuario debe cerrar el timer primero.
 */
export function ActiveTimerWarningDialog({
  open,
  timerLabel,
  breakType,
  onDismiss,
}: ActiveTimerWarningDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 border border-fm-surface-container-high">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl">timer</span>
          </div>
          <p className="text-sm font-semibold text-fm-on-surface">Timer activo</p>
        </div>
        <p className="text-sm text-fm-on-surface-variant">
          Tienes un timer activo:{' '}
          <strong className="text-fm-on-surface">
            &ldquo;{timerLabel ?? 'requerimiento'}&rdquo;
          </strong>
          .{' '}
          Ciérralo antes de marcar {breakType === 'lunch' ? 'el almuerzo' : 'away'}.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full px-4 py-2 rounded-full bg-fm-primary text-white text-sm font-bold hover:bg-fm-primary-dim transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
