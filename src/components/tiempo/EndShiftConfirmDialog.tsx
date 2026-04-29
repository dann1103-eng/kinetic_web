'use client'

interface EndShiftConfirmDialogProps {
  open: boolean
  timerLabel: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal in-app que se muestra al intentar finalizar la jornada cuando hay un
 * time entry activo. El caller decide qué hacer al confirmar (típicamente:
 * stopActiveEntry + endShift).
 */
export function EndShiftConfirmDialog({
  open,
  timerLabel,
  onConfirm,
  onCancel,
}: EndShiftConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 border border-fm-surface-container-high">
        <p className="text-sm font-semibold text-fm-on-surface">Finalizar jornada</p>
        <p className="text-sm text-fm-on-surface-variant">
          Tienes un timer activo:{' '}
          <strong className="text-fm-on-surface">&ldquo;{timerLabel}&rdquo;</strong>.
          Si finalizas la jornada, se detendrá automáticamente.
        </p>
        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-semibold text-fm-on-surface-variant border border-fm-surface-container-high hover:bg-fm-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-full bg-fm-error/10 text-fm-error border border-fm-error/30 text-sm font-bold hover:bg-fm-error/15 transition-colors"
          >
            Finalizar jornada
          </button>
        </div>
      </div>
    </div>
  )
}
