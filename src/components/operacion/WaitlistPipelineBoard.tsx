'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PHASE_GROUP_COLORS,
  PHASE_GROUP_LABELS,
  REFERRAL_CHANNEL_LABELS,
  SERVICE_TYPE_LABELS,
  type IntakePhaseCatalogEntry,
  type PhaseGroupNumber,
  type WaitlistEntry,
} from '@/types/db'
import { groupPhaseCatalog } from '@/lib/domain/intake-pipeline'
import { advanceWaitlistPhase } from '@/app/actions/intake-pipeline'
import { dropEntry, reopenEntry } from '@/app/actions/waitlist'
import { daysSinceAdded } from '@/lib/domain/waitlist-alerts'
import { PhaseAdvanceMenu } from '@/components/pipeline/PhaseAdvanceMenu'

interface Props {
  entries: WaitlistEntry[]
  therapistsById: Record<string, string>
  familyIdByChildId?: Record<string, string>
  phaseCatalog: IntakePhaseCatalogEntry[]
}

const PRIORITY_TONE: Record<number, { label: string; bg: string; text: string }> = {
  0: { label: 'Normal', bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' },
  1: { label: 'Alta', bg: 'bg-amber-100', text: 'text-amber-900' },
  2: { label: 'Urgente', bg: 'bg-rose-100', text: 'text-rose-900' },
}

function calcAge(birthdate: string | null): string {
  if (!birthdate) return ''
  const [y, m, d] = birthdate.split('-').map(Number)
  const dob = new Date(y, m - 1, d)
  const now = new Date()
  let years = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) years--
  if (years < 1) {
    const months = (now.getFullYear() - dob.getFullYear()) * 12 + monthDiff
    return `${months}m`
  }
  return `${years}a`
}

/**
 * Vista pipeline (estilo kanban) de la lista de espera. Las entradas se
 * agrupan por `current_phase_code` en columnas, y las columnas a su vez se
 * agrupan visualmente por grupo (1. Primer contacto, 2. Proceso de Admisión,
 * 3. Inicio Terapéutico). Cada card es una familia; click → drawer con
 * detalle + acciones.
 *
 * Solo muestra fases con `is_waitlist_visible=true` (1.x, 2.x, 3.x).
 * Las terminales 5.x viven en el toggle de "histórico".
 */
export function WaitlistPipelineBoard({
  entries,
  therapistsById,
  familyIdByChildId,
  phaseCatalog,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WaitlistEntry | null>(null)
  const [dropTarget, setDropTarget] = useState<WaitlistEntry | null>(null)
  const [dropReason, setDropReason] = useState('')

  const visiblePhases = useMemo(
    () => phaseCatalog.filter((p) => p.is_waitlist_visible).sort((a, b) => a.sort_order - b.sort_order),
    [phaseCatalog],
  )
  const groups = useMemo(
    () => groupPhaseCatalog(visiblePhases),
    [visiblePhases],
  )

  // Agrupar entries por phase code
  const byPhase = useMemo(() => {
    const map: Record<string, WaitlistEntry[]> = {}
    for (const e of entries) {
      const code = e.current_phase_code ?? '1_1_contacto_inicial'
      if (!map[code]) map[code] = []
      map[code].push(e)
    }
    return map
  }, [entries])

  function handleAdvance(entryId: string, toCode: string) {
    setError(null)
    startTransition(async () => {
      const res = await advanceWaitlistPhase(entryId, toCode)
      if (!res.ok) setError(res.error)
      else {
        setSelected(null)
        router.refresh()
      }
    })
  }

  function handleReopen(entryId: string) {
    setError(null)
    startTransition(async () => {
      const res = await reopenEntry(entryId)
      if (!res.ok) setError(res.error)
      else {
        setSelected(null)
        router.refresh()
      }
    })
  }

  function confirmDrop() {
    if (!dropTarget) return
    setError(null)
    startTransition(async () => {
      const res = await dropEntry(dropTarget.id, dropReason)
      if (!res.ok) setError(res.error)
      else {
        setDropTarget(null)
        setDropReason('')
        setSelected(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Pipeline horizontal */}
      <div className="space-y-6">
        {groups.map((g) => {
          const palette = PHASE_GROUP_COLORS[g.group_number as PhaseGroupNumber]
          const totalInGroup = g.phases.reduce(
            (sum, p) => sum + (byPhase[p.code]?.length ?? 0),
            0,
          )
          return (
            <section key={g.group_number} className="space-y-2">
              <header className="flex items-baseline gap-3">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${palette.bg} ${palette.text}`}
                >
                  <span className="font-mono text-[10px] opacity-70">
                    Grupo {g.group_number}
                  </span>
                  {PHASE_GROUP_LABELS[g.group_number as PhaseGroupNumber]}
                </span>
                <span className="text-xs text-fm-on-surface-variant tabular-nums">
                  {totalInGroup} {totalInGroup === 1 ? 'familia' : 'familias'}
                </span>
              </header>

              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-min">
                  {g.phases.map((phase) => {
                    const items = byPhase[phase.code] ?? []
                    return (
                      <PhaseColumn
                        key={phase.code}
                        phase={phase}
                        items={items}
                        palette={palette}
                        therapistsById={therapistsById}
                        onSelect={(e) => setSelected(e)}
                      />
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          entry={selected}
          phaseCatalog={phaseCatalog}
          therapistsById={therapistsById}
          familyIdByChildId={familyIdByChildId}
          isPending={isPending}
          onClose={() => setSelected(null)}
          onAdvance={(toCode) => handleAdvance(selected.id, toCode)}
          onDrop={() => setDropTarget(selected)}
          onReopen={() => handleReopen(selected.id)}
        />
      )}

      {/* Drop modal */}
      {dropTarget && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-base font-semibold text-fm-on-surface">Descartar entrada</h3>
            <p className="text-xs text-fm-on-surface-variant">
              ¿Por qué se descarta a {dropTarget.child_full_name}?
            </p>
            <textarea
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              rows={3}
              placeholder="Ej: se fue a otra clínica, no contesta, etc."
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDropTarget(null)
                  setDropReason('')
                }}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDrop}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-fm-error text-white font-semibold hover:bg-fm-error/90 disabled:opacity-60"
              >
                {isPending ? 'Descartando…' : 'Descartar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Column
// ──────────────────────────────────────────────────────────────────────────

function PhaseColumn({
  phase,
  items,
  palette,
  therapistsById,
  onSelect,
}: {
  phase: IntakePhaseCatalogEntry
  items: WaitlistEntry[]
  palette: { bg: string; text: string; ring: string }
  therapistsById: Record<string, string>
  onSelect: (e: WaitlistEntry) => void
}) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <div
        className={`rounded-t-xl px-3 py-2 border-b-2 ${palette.bg} ${palette.text}`}
        style={{ borderColor: 'currentColor' }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold leading-tight">
            <span className="font-mono opacity-70">
              {phase.group_number}.{phase.sub_order}
            </span>{' '}
            {phase.label}
          </p>
          <span className="text-[10px] font-semibold tabular-nums bg-white/40 px-1.5 py-0.5 rounded">
            {items.length}
          </span>
        </div>
        {phase.is_optional && (
          <p className="text-[10px] italic opacity-80 mt-0.5">Opcional</p>
        )}
      </div>

      <div className="bg-fm-surface-container-low/30 rounded-b-xl border border-fm-outline-variant/20 border-t-0 p-2 flex-1 min-h-[120px] space-y-2">
        {items.length === 0 && (
          <p className="text-[11px] italic text-fm-on-surface-variant text-center py-6">
            Sin familias en esta fase.
          </p>
        )}
        {items.map((e) => (
          <Card
            key={e.id}
            entry={e}
            therapistsById={therapistsById}
            onClick={() => onSelect(e)}
          />
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────────────────────

function Card({
  entry,
  therapistsById,
  onClick,
}: {
  entry: WaitlistEntry
  therapistsById: Record<string, string>
  onClick: () => void
}) {
  const priority = PRIORITY_TONE[entry.priority] ?? PRIORITY_TONE[0]
  const days = daysSinceAdded(entry.added_at)
  const age = entry.child_age_text ?? calcAge(entry.child_birthdate)
  const therapist = entry.preferred_therapist_id
    ? therapistsById[entry.preferred_therapist_id]
    : null
  const isStale = days > 14 && entry.priority >= 1

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-fm-surface-container-lowest p-2.5 hover:shadow-md hover:border-fm-primary/40 transition-all space-y-1.5 ${
        isStale ? 'border-amber-400' : 'border-fm-outline-variant/30'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fm-on-surface leading-tight truncate">
            {entry.child_full_name}
          </p>
          {age && (
            <p className="text-[11px] text-fm-on-surface-variant">{age}</p>
          )}
        </div>
        {entry.priority > 0 && (
          <span
            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${priority.bg} ${priority.text}`}
          >
            {entry.priority === 2 ? '!!' : '!'}
          </span>
        )}
      </div>

      <p className="text-[11px] text-fm-on-surface-variant truncate">
        {SERVICE_TYPE_LABELS[entry.requested_service_type] ?? entry.requested_service_type}
      </p>

      {(therapist || entry.referral_channel) && (
        <div className="flex flex-wrap items-center gap-1">
          {therapist && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-fm-primary/10 text-fm-primary truncate max-w-full">
              {therapist}
            </span>
          )}
          {entry.referral_channel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-fm-secondary/10 text-fm-secondary">
              {REFERRAL_CHANNEL_LABELS[entry.referral_channel]}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-fm-on-surface-variant pt-1 border-t border-fm-outline-variant/10">
        <span className="truncate">{entry.parent_full_name}</span>
        <span className={`tabular-nums ${isStale ? 'text-amber-700 font-bold' : ''}`}>
          {days === 0 ? 'hoy' : `${days}d`}
        </span>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Detail drawer
// ──────────────────────────────────────────────────────────────────────────

function DetailDrawer({
  entry,
  phaseCatalog,
  therapistsById,
  familyIdByChildId,
  isPending,
  onClose,
  onAdvance,
  onDrop,
  onReopen,
}: {
  entry: WaitlistEntry
  phaseCatalog: IntakePhaseCatalogEntry[]
  therapistsById: Record<string, string>
  familyIdByChildId?: Record<string, string>
  isPending: boolean
  onClose: () => void
  onAdvance: (toCode: string) => void
  onDrop: () => void
  onReopen: () => void
}) {
  const currentPhase = phaseCatalog.find((p) => p.code === entry.current_phase_code)
  const days = daysSinceAdded(entry.added_at)
  const therapist = entry.preferred_therapist_id
    ? therapistsById[entry.preferred_therapist_id]
    : null
  const childLink =
    entry.scheduled_child_id && familyIdByChildId?.[entry.scheduled_child_id]
      ? `/familias/${familyIdByChildId[entry.scheduled_child_id]}/children/${entry.scheduled_child_id}`
      : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="bg-fm-surface-container-lowest w-full max-w-md h-full overflow-y-auto shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
              {currentPhase ? `${currentPhase.group_number}.${currentPhase.sub_order} · ${currentPhase.group_name}` : 'Sin fase'}
            </p>
            <h3 className="text-lg font-bold text-fm-on-surface mt-0.5">
              {entry.child_full_name}
            </h3>
            {currentPhase && (
              <p className="text-sm text-fm-on-surface-variant">{currentPhase.label}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fm-on-surface-variant hover:text-fm-on-surface"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="space-y-2 text-sm">
          {entry.child_age_text || entry.child_birthdate ? (
            <Row label="Edad" value={entry.child_age_text ?? calcAge(entry.child_birthdate)} />
          ) : null}
          {entry.child_diagnosis && <Row label="Diagnóstico" value={entry.child_diagnosis} />}
          {entry.has_previous_evaluation !== null && (
            <Row label="Eval. previa" value={entry.has_previous_evaluation ? 'Sí' : 'No'} />
          )}
          <Row
            label="Servicio"
            value={SERVICE_TYPE_LABELS[entry.requested_service_type] ?? entry.requested_service_type}
          />
          {entry.interest_text && <Row label="Interés" value={entry.interest_text} />}
          <Row label="Padre/madre" value={entry.parent_full_name} />
          <Row label="Teléfono" value={
            <a href={`tel:${entry.parent_phone}`} className="text-fm-primary hover:underline">
              {entry.parent_phone}
            </a>
          } />
          {entry.parent_email && (
            <Row label="Email" value={
              <a href={`mailto:${entry.parent_email}`} className="text-fm-primary hover:underline">
                {entry.parent_email}
              </a>
            } />
          )}
          {entry.referral_channel && (
            <Row
              label="Conoció por"
              value={
                REFERRAL_CHANNEL_LABELS[entry.referral_channel] +
                (entry.referral_channel_other ? ` (${entry.referral_channel_other})` : '')
              }
            />
          )}
          {therapist && <Row label="Terapista preferida" value={therapist} />}
          {entry.preferred_days && <Row label="Días preferidos" value={entry.preferred_days} />}
          <Row label="Días en espera" value={`${days}d`} />
          <Row label="Prioridad" value={PRIORITY_TONE[entry.priority]?.label ?? 'Normal'} />
          {entry.notes && <Row label="Notas" value={entry.notes} />}
          {entry.status === 'dropped' && entry.dropped_reason && (
            <Row label="Motivo de descarte" value={entry.dropped_reason} />
          )}
        </div>

        {childLink && (
          <Link
            href={childLink}
            className="block text-center text-sm font-semibold py-2 rounded-lg bg-fm-primary/10 text-fm-primary hover:bg-fm-primary/15"
          >
            Ver ficha del niño →
          </Link>
        )}

        <div className="pt-3 border-t border-fm-outline-variant/20 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
            Acciones
          </p>
          {entry.status !== 'dropped' && (
            <div className="flex flex-wrap gap-2">
              <PhaseAdvanceMenu
                catalog={phaseCatalog}
                currentCode={entry.current_phase_code}
                onlyWaitlistVisible
                disabled={isPending}
                onAdvance={onAdvance}
                label="Cambiar fase…"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={onDrop}
                className="text-xs font-semibold text-fm-error hover:underline disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          )}
          {entry.status === 'dropped' && (
            <button
              type="button"
              disabled={isPending}
              onClick={onReopen}
              className="text-xs font-semibold text-fm-primary hover:underline disabled:opacity-50"
            >
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant w-24 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-fm-on-surface flex-1">{value}</span>
    </div>
  )
}
