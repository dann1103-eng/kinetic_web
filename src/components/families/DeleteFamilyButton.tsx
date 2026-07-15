'use client'

import { useState } from 'react'
import { deleteFamily } from '@/app/actions/families'

interface DeleteFamilyButtonProps {
  familyId: string
  familyName: string
  childrenCount: number
}

/**
 * Botón de borrado PERMANENTE de una familia (admin-only). Pide confirmación
 * escrita porque `deleteFamily` elimina en cascada todos sus niños y el
 * historial de cada uno (citas, informes, ciclos, etc.) vía FK ON DELETE CASCADE.
 */
export function DeleteFamilyButton({ familyId, familyName, childrenCount }: DeleteFamilyButtonProps) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setError(null)
    setPending(true)
    try {
      const res = await deleteFamily(familyId)
      if (res && !res.ok) {
        setError(res.error)
        setPending(false)
      }
      // Éxito: deleteFamily() redirige a /familias por su cuenta.
    } catch {
      setError('No se pudo eliminar. Revisa tu conexión e inténtalo de nuevo.')
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Eliminar familia permanentemente"
        className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-xl text-fm-on-surface-variant hover:text-fm-error hover:bg-fm-error/10 transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-fm-surface-container-lowest text-fm-on-surface w-full max-w-md rounded-2xl shadow-xl border border-fm-outline-variant/30 p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-fm-error">
              <span className="material-symbols-outlined" aria-hidden="true">warning</span>
              <h2 className="text-base font-semibold">Eliminar familia permanentemente</h2>
            </div>
            <p className="text-sm text-fm-on-surface-variant">
              Esto <strong>borra de forma irreversible</strong> a <strong>{familyName}</strong>.
              {childrenCount > 0 ? (
                <>
                  {' '}Esta familia tiene <strong>{childrenCount}</strong>{' '}
                  {childrenCount === 1 ? 'niño/a registrado' : 'niños/as registrados'}, y se
                  eliminarán también junto con todo su historial (citas, informes, ciclos y
                  notas). No se puede deshacer.
                </>
              ) : (
                ' No tiene niños/as registrados actualmente. No se puede deshacer.'
              )}
            </p>
            <div>
              <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">
                Escribe <span className="font-mono font-semibold">ELIMINAR</span> para confirmar
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-error"
              />
            </div>
            {error && <p role="alert" className="text-xs text-fm-error">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="min-h-[40px] px-4 py-2 text-sm rounded-xl text-fm-on-surface-variant hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending || confirmText.trim().toUpperCase() !== 'ELIMINAR'}
                className="min-h-[40px] px-4 py-2 text-sm rounded-xl bg-fm-error text-white hover:bg-fm-error/90 disabled:opacity-40"
              >
                {pending ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
