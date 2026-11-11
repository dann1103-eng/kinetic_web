'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  applyAgendaPlanSync,
  previewChildAgendaDrift,
  type AgendaDriftRow,
} from '@/app/actions/agenda-plan-sync'
import { AgendaDriftDetail, driftSummary, monthLabel } from '@/components/agenda/AgendaDriftDetail'

/**
 * Aviso en la ficha del niño cuando la agenda de sus ciclos vigentes no coincide
 * con su plan, con el botón para ponerla al día ahí mismo.
 *
 * Existe porque el desfase era invisible: el plan se veía bien, la agenda mal, y
 * nada en la ficha decía que las dos cosas no concordaban ni ofrecía corregirlo
 * sin anular el ciclo. Si todo coincide, no se muestra nada.
 */
export function AgendaPlanDriftBanner({ childId }: { childId: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<AgendaDriftRow[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isApplying, startApply] = useTransition()

  useEffect(() => {
    let cancelled = false
    previewChildAgendaDrift(childId).then((res) => {
      if (cancelled) return
      setRows(res.ok ? res.rows : [])
    })
    return () => {
      cancelled = true
    }
  }, [childId])

  function handleApply() {
    setError(null)
    startApply(async () => {
      const res = await applyAgendaPlanSync(rows.map((r) => r.cycleId))
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.failed.length > 0) {
        setError(res.failed.map((f) => f.error).join(' '))
      } else {
        setDone(
          `Agenda al día: ${res.cancelled} cita(s) quitada(s), ${res.created} agregada(s)${res.resized > 0 ? `, ${res.resized} con la duración corregida` : ''}.`,
        )
      }
      const again = await previewChildAgendaDrift(childId)
      setRows(again.ok ? again.rows : [])
      setOpen(false)
      router.refresh()
    })
  }

  if (rows.length === 0) {
    if (!done) return null
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {done}
      </div>
    )
  }

  // Una terapia entera fuera del plan pide atención; una cita suelta movida casi
  // siempre es intencional, así que se avisa sin alarma.
  const serious = rows.some((r) => r.severity === 'systematic')
  const tone = serious
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-fm-outline-variant/30 bg-fm-surface-container-low text-fm-on-surface'

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {serious
              ? 'La agenda no coincide con el plan'
              : 'Hay citas fuera del horario del plan'}
          </p>
          <ul className="mt-0.5 text-xs">
            {rows.map((r) => (
              <li key={r.cycleId}>
                <span className="capitalize">{monthLabel(r.periodMonth)}</span>: {driftSummary(r)}
              </li>
            ))}
          </ul>
          {!serious && (
            <p className="mt-1 text-[11px] text-fm-on-surface-variant">
              Si alguien las movió a propósito, no hace falta hacer nada.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-lg border border-current/30 bg-white/70 px-3 py-1.5 text-xs font-semibold hover:bg-white"
        >
          {open ? 'Cerrar' : 'Ver y corregir'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-current/15 pt-3">
          {rows.map((r) => (
            <div key={r.cycleId} className="space-y-1.5">
              <p className="text-xs font-semibold capitalize">
                {monthLabel(r.periodMonth)}
                {r.paymentStatus === 'paid' && (
                  <span className="ml-2 font-normal normal-case text-fm-on-surface-variant">
                    (mes pagado: no se re-cobra; si cambia la cantidad de sesiones, la diferencia va
                    a la mensualidad siguiente)
                  </span>
                )}
              </p>
              <AgendaDriftDetail row={r} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-fm-on-surface-variant">
              Solo se toca lo que todavía no se dio. Si lo que está mal es el plan, corregilo abajo:
              al guardarlo la agenda se actualiza sola.
            </p>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="rounded-lg bg-fm-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isApplying ? 'Sincronizando…' : 'Poner la agenda como el plan'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-fm-error">{error}</p>}
    </div>
  )
}
