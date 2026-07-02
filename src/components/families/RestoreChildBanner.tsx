'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { unarchiveChild } from '@/app/actions/children'

/**
 * Banner que aparece cuando un niño está archivado (mig 0166): permite
 * restaurarlo (reversible). Se muestra a roles de gestión en la ficha del niño.
 */
export function RestoreChildBanner({
  childId,
  archivedAt,
}: {
  childId: string
  archivedAt: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function restore() {
    setError(null)
    startTransition(async () => {
      const res = await unarchiveChild(childId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <span className="material-symbols-outlined text-amber-600 mt-0.5">inventory_2</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-amber-900">Niño/a archivado/a</p>
        <p className="text-xs text-amber-800 mt-0.5">
          Archivado automáticamente el{' '}
          {new Date(archivedAt).toLocaleDateString('es-SV', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          (baja hace más de 3 meses). Sus datos se conservan; puedes restaurarlo.
        </p>
        {error && <p className="text-xs text-fm-error mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? 'Restaurando…' : 'Restaurar'}
      </button>
    </div>
  )
}
