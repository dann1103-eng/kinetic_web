'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteChild } from '@/app/actions/children'

interface DeleteChildButtonProps {
  childId: string
  familyId: string
  childName: string
}

/**
 * Botón de borrado PERMANENTE de un niño (distinto de "dar de baja"). Pide
 * confirmación escrita porque elimina en cascada todo el historial del niño
 * (citas, informes, ciclos, etc.). Gateado por rol en la página.
 */
export function DeleteChildButton({ childId, familyId, childName }: DeleteChildButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setError(null)
    setPending(true)
    try {
      const res = await deleteChild(childId)
      if (!res.ok) {
        setError(res.error)
        setPending(false)
        return
      }
      // Éxito: volver al perfil de la familia.
      router.push(`/familias/${res.familyId ?? familyId}`)
      router.refresh()
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
        title="Eliminar niño/a permanentemente"
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
              <h2 className="text-base font-semibold">Eliminar niño/a permanentemente</h2>
            </div>
            <p className="text-sm text-fm-on-surface-variant">
              Esto <strong>borra de forma irreversible</strong> a <strong>{childName}</strong> y
              todo su historial (citas, informes, ciclos y notas). No se puede deshacer. Si solo
              quieres retirarlo del horario, usa <strong>dar de baja</strong> en su lugar.
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
