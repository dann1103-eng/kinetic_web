'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listReassignTargets,
  reassignAllFromTherapist,
} from '@/app/actions/therapist-reassignment'
import type { UserRole } from '@/types/db'

/**
 * Sustituir a esta persona por otra: redirige TODAS sus terapias (planes + citas
 * futuras) a otra terapeuta sin borrar el perfil. Pensado para relevos (ej. una
 * terapeuta se va y otra toma a sus niños). No toca citas ya completadas.
 */
export function ReassignTherapistSection({
  fromUserId,
  fromUserName,
}: {
  fromUserId: string
  fromUserName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<{ id: string; full_name: string; role: UserRole }[] | null>(null)
  const [toId, setToId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || targets !== null) return
    let cancelled = false
    listReassignTargets(fromUserId)
      .then((rows) => {
        if (!cancelled) setTargets(rows)
      })
      .catch(() => {
        if (!cancelled) setTargets([])
      })
    return () => {
      cancelled = true
    }
  }, [open, targets, fromUserId])

  function run() {
    if (!toId) return
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await reassignAllFromTherapist(fromUserId, toId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult(
        `Listo: ${res.plansUpdated} plan(es) y ${res.appointmentsUpdated} cita(s) futura(s) redirigidas.`,
      )
      setConfirming(false)
      router.refresh()
    })
  }

  const targetName = targets?.find((t) => t.id === toId)?.full_name ?? ''

  return (
    <div className="space-y-3 pt-4 border-t border-fm-outline-variant/15">
      <p className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
        Sustituir / redirigir terapias
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-fm-primary hover:underline"
        >
          <span className="material-symbols-outlined text-base">swap_horiz</span>
          Pasar sus niños a otra terapeuta
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fm-on-surface-variant">
            Redirige todas las terapias de <strong>{fromUserName}</strong> (planes activos y
            citas futuras) a otra persona. El perfil no se borra y las citas ya completadas se
            conservan con la terapeuta original.
          </p>
          <div>
            <label className="text-xs font-semibold text-fm-on-surface-variant">Nueva terapeuta</label>
            <select
              value={toId}
              onChange={(e) => {
                setToId(e.target.value)
                setConfirming(false)
                setResult(null)
              }}
              className="mt-1 w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm bg-fm-background focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
            >
              <option value="">
                {targets === null ? 'Cargando…' : 'Elegí una persona…'}
              </option>
              {(targets ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-fm-error">{error}</p>}
          {result && <p className="text-xs text-emerald-700 font-semibold">{result}</p>}

          {!confirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!toId || pending}
                onClick={() => setConfirming(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:bg-fm-primary/90 disabled:opacity-40"
              >
                Sustituir
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setToId(''); setResult(null); setError(null) }}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                ¿Confirmás pasar todas las terapias de <strong>{fromUserName}</strong> a{' '}
                <strong>{targetName}</strong>?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={run}
                  className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:bg-fm-primary/90 disabled:opacity-50"
                >
                  {pending ? 'Sustituyendo…' : 'Sí, sustituir'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
