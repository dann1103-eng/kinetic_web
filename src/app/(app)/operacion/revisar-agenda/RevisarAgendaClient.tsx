'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  applyAgendaPlanSync,
  previewMonthAgendaDrift,
  type AgendaDriftProblem,
  type AgendaDriftRow,
} from '@/app/actions/agenda-plan-sync'
import { AgendaDriftDetail, driftSummary } from '@/components/agenda/AgendaDriftDetail'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

type Kind = AgendaDriftRow['kind']

/**
 * Los grupos, en el orden en que se muestran. Solo el primero arranca tildado:
 * es el único donde la agenda está mal sin lugar a dudas. En los demás hay que
 * mirar antes de tocar (ver `classifyDrift`).
 */
const GROUPS: { kind: Kind; title: string; help: string; warn?: boolean }[] = [
  {
    kind: 'out_of_plan',
    title: 'Agenda distinta al plan',
    help: 'Citas en un día u hora que el plan no tiene, de una terapia que no es del plan, o duplicadas. Esto es lo que hay que corregir.',
  },
  {
    kind: 'week_shift',
    title: 'Mismo día y hora, pero otra semana',
    help: 'Casi siempre es un horario quincenal. Antes de sincronizar, abrí el plan y revisá si es 1ª y 3ª o 2ª y 4ª semana: hasta noviembre de 2026 el plan no guardaba esa elección, así que lo más probable es que la agenda esté bien y el plan mal. Corregí la semana en el plan y esta diferencia desaparece sola.',
    warn: true,
  },
  {
    kind: 'moved',
    title: 'Citas movidas',
    help: 'Una o dos citas fuera del horario del plan, con el resto en su lugar. Casi siempre alguien las movió a propósito: sincronizá solo las que sean un error.',
  },
  {
    kind: 'missing_only',
    title: 'Solo faltan citas',
    help: 'No hay nada mal agendado: el plan generaría estas citas y no están. Puede ser a propósito (se quitaron al generar el ciclo, o el niño/a viene semana de por medio). Sincronizar las crea y el cobro las suma, así que agregalas solo si de verdad faltan.',
  },
]

interface Preview {
  rows: AgendaDriftRow[]
  problems: AgendaDriftProblem[]
  checked: number
  inactive: number
}

export function RevisarAgendaClient() {
  const [month, setMonth] = useState(currentMonth())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState<AgendaDriftProblem[]>([])
  const [isLoading, startLoad] = useTransition()
  const [isApplying, startApply] = useTransition()

  async function refresh() {
    const res = await previewMonthAgendaDrift(`${month}-01`)
    if (!res.ok) {
      setError(res.error)
      setPreview(null)
      return
    }
    setPreview({ rows: res.rows, problems: res.problems, checked: res.checked, inactive: res.inactive })
    // Solo arranca tildado (y abierto) lo que está mal sin lugar a dudas.
    const clear = res.rows.filter((r) => r.kind === 'out_of_plan').map((r) => r.cycleId)
    setSelected(new Set(clear))
    setOpen(new Set(clear))
  }

  function handlePreview() {
    setError(null)
    setDone(null)
    setFailed([])
    startLoad(refresh)
  }

  function handleApply() {
    if (!preview || selected.size === 0) return
    if (
      !window.confirm(
        `Se va a poner al día la agenda de ${selected.size} ciclo(s): se quitan las citas futuras que el plan ya no tiene y se agregan las que faltan. Lo que ya se dio no se toca. ¿Continuar?`,
      )
    ) {
      return
    }
    setError(null)
    setDone(null)
    startApply(async () => {
      const res = await applyAgendaPlanSync([...selected])
      if (!res.ok) {
        setError(res.error)
        return
      }
      setFailed(res.failed)
      setDone(
        `Listo: ${res.applied} ciclo(s) al día — ${res.cancelled} cita(s) quitada(s), ${res.created} agregada(s)${res.resized > 0 ? `, ${res.resized} con la duración corregida` : ''}.`,
      )
      await refresh()
    })
  }

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  function renderGroup(rows: AgendaDriftRow[]) {
    return (
      <div className="overflow-hidden rounded-lg border border-fm-outline-variant/20 bg-fm-surface-container-lowest">
        {rows.map((r) => {
          const isOpen = open.has(r.cycleId)
          return (
            <div key={r.cycleId} className="border-t border-fm-outline-variant/10 first:border-t-0">
              <div className="flex items-start gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(r.cycleId)}
                  onChange={() => setSelected((prev) => toggle(prev, r.cycleId))}
                  aria-label={`Sincronizar la agenda de ${r.childName}`}
                  className="mt-1 rounded text-fm-primary focus:ring-fm-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {r.familyId ? (
                      <Link
                        href={`/familias/${r.familyId}/children/${r.childId}`}
                        className="text-sm font-medium text-fm-on-surface hover:text-fm-primary hover:underline"
                      >
                        {r.childName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-fm-on-surface">{r.childName}</span>
                    )}
                    {r.paymentStatus === 'paid' && (
                      <span className="rounded-full bg-fm-surface-container px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">
                        Mes pagado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-fm-on-surface-variant">{driftSummary(r)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen((prev) => toggle(prev, r.cycleId))}
                  aria-expanded={isOpen}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-fm-primary hover:bg-fm-surface-container"
                >
                  {isOpen ? 'Ocultar' : 'Ver citas'}
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-fm-outline-variant/10 bg-fm-surface-container-low/40 px-3 py-3 sm:pl-10">
                  <AgendaDriftDetail row={r} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-fm-on-surface-variant">Mes</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isLoading || isApplying}
          className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isLoading ? 'Revisando…' : 'Revisar el mes'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {done}
        </div>
      )}
      {failed.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">No se pudo poner al día:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {failed.map((f, i) => (
              <li key={i}>
                <b>{f.childName}</b>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <p className="text-xs text-fm-on-surface-variant">
          Se revisaron {preview.checked} ciclo(s).
          {preview.inactive > 0 &&
            ` ${preview.inactive} de niños en pausa o con alta/retiro no se revisan.`}
        </p>
      )}

      {preview && preview.rows.length === 0 && preview.problems.length === 0 && (
        <p className="text-sm text-fm-on-surface-variant">
          La agenda de este mes coincide con el plan de cada niño/a. No hay nada que corregir.
        </p>
      )}

      {GROUPS.map((g) => {
        const rows = (preview?.rows ?? []).filter((r) => r.kind === g.kind)
        if (rows.length === 0) return null
        return (
          <section key={g.kind} className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-fm-on-surface">
                {g.title} ({rows.length})
              </h2>
              <p
                className={
                  g.warn
                    ? 'mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900'
                    : 'text-xs text-fm-on-surface-variant'
                }
              >
                {g.help}
              </p>
            </div>
            {renderGroup(rows)}
          </section>
        )
      })}

      {preview && preview.problems.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-fm-on-surface">
            No se pudieron revisar ({preview.problems.length})
          </h2>
          <ul className="list-disc pl-5 text-xs text-fm-on-surface-variant">
            {preview.problems.map((p, i) => (
              <li key={i}>
                <b className="text-fm-on-surface">{p.childName}</b>: {p.error}
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview && preview.rows.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-fm-outline-variant/20 bg-fm-surface py-3">
          <p className="text-sm text-fm-on-surface-variant">
            {selected.size} de {preview.rows.length} seleccionado(s)
          </p>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || isLoading || selected.size === 0}
            className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isApplying ? 'Sincronizando…' : 'Poner al día los seleccionados'}
          </button>
        </div>
      )}
    </div>
  )
}
