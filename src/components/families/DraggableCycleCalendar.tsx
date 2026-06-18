'use client'

import { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { MonthlyCandidateAppointment, ServiceType } from '@/types/db'

const TZ = 'America/El_Salvador'
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

interface Props {
  /** 'YYYY-MM-01' del mes que se está visualizando. */
  periodMonth: string
  /** Citas a mostrar (mutable: el usuario puede arrastrar). */
  candidates: MonthlyCandidateAppointment[]
  /** Callback cuando el usuario mueve una cita a otro día. */
  onMove: (index: number, newStartsAt: string, newEndsAt: string) => void
  /** Callback cuando el usuario edita la hora de una cita (mismo día). */
  onRetime?: (index: number, newStartsAt: string, newEndsAt: string) => void
  /** Callback para quitar una cita del ciclo (ej. el papá avisa que faltará). */
  onDelete?: (index: number) => void
  /** Render-only mode (sin drag, solo preview). */
  readOnly?: boolean
}

function dateKeyInSV(iso: string): string {
  const local = toZonedTime(new Date(iso), TZ)
  const y = local.getFullYear()
  const m = String(local.getMonth() + 1).padStart(2, '0')
  const d = String(local.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Reposicionar starts_at a un nuevo día manteniendo la hora local SV. */
function moveToDay(originalISO: string, newDateKey: string): string | null {
  const local = toZonedTime(new Date(originalISO), TZ)
  const [y, mo, d] = newDateKey.split('-').map(Number)
  if (!y || !mo || !d) return null
  // fromZonedTime lee los componentes wall-clock (year/month/day/hour/min)
  // y los interpreta como tiempo local SV → devuelve UTC.
  const localDate = new Date(y, mo - 1, d, local.getHours(), local.getMinutes(), 0)
  return fromZonedTime(localDate, TZ).toISOString()
}

function timeLabel(iso: string): string {
  const local = toZonedTime(new Date(iso), TZ)
  return `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
}

/** Cambiar la hora local SV de un appointment manteniendo el día. */
function retimeOnDay(
  originalISO: string,
  hhmm: string,
  durationMinutes: number,
): { startsAt: string; endsAt: string } | null {
  const [h, min] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  const local = toZonedTime(new Date(originalISO), TZ)
  const localDate = new Date(local.getFullYear(), local.getMonth(), local.getDate(), h, min, 0)
  const startsAt = fromZonedTime(localDate, TZ).toISOString()
  const endsAt = new Date(
    new Date(startsAt).getTime() + durationMinutes * 60 * 1000,
  ).toISOString()
  return { startsAt, endsAt }
}

function serviceLabel(s: string): string {
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? s
}

export function DraggableCycleCalendar({ periodMonth, candidates, onMove, onRetime, onDelete, readOnly }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const { firstDayOffset, days } = useMemo(() => {
    const [y, m] = periodMonth.split('-').map(Number)
    const firstOfMonth = new Date(y, m - 1, 1, 12, 0, 0)
    const offset = firstOfMonth.getDay()
    const total = new Date(y, m, 0).getDate()
    const arr: string[] = []
    for (let d = 1; d <= total; d++) {
      arr.push(`${periodMonth.slice(0, 8)}${String(d).padStart(2, '0')}`)
    }
    return { firstDayOffset: offset, days: arr }
  }, [periodMonth])

  const candidatesByDay = useMemo(() => {
    const map = new Map<string, { idx: number; cand: MonthlyCandidateAppointment }[]>()
    candidates.forEach((c, idx) => {
      const key = dateKeyInSV(c.starts_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ idx, cand: c })
    })
    return map
  }, [candidates])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !active) return
    const targetDateKey = String(over.id)
    if (!days.includes(targetDateKey)) return
    const idx = Number(active.id)
    if (Number.isNaN(idx)) return
    const cand = candidates[idx]
    if (!cand) return
    const currentKey = dateKeyInSV(cand.starts_at)
    if (currentKey === targetDateKey) return

    // Mover starts_at al nuevo día, manteniendo la hora local
    const newStartsISO = moveToDay(cand.starts_at, targetDateKey)
    if (!newStartsISO) return
    const newEndsISO = new Date(
      new Date(newStartsISO).getTime() + (cand.duration_minutes ?? 30) * 60 * 1000,
    ).toISOString()
    onMove(idx, newStartsISO, newEndsISO)
  }

  const monthHeader = new Date(`${periodMonth}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-fm-on-surface capitalize">{monthHeader}</h3>
          {!readOnly && (
            <p className="text-[11px] text-fm-on-surface-variant">
              Arrastrá las citas a otro día{onRetime ? ' o editá su hora' : ' (la hora se mantiene)'}
              {onDelete ? ' · quitalas con ✕' : ''}.
            </p>
          )}
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-fm-on-surface-variant mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center font-medium">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOffset }, (_, i) => (
            <div key={`pad-${i}`} className="min-h-[68px]" />
          ))}
          {days.map((dateKey) => (
            <DayCell
              key={dateKey}
              dateKey={dateKey}
              dayNum={parseInt(dateKey.slice(8, 10), 10)}
              entries={candidatesByDay.get(dateKey) ?? []}
              onRetime={onRetime}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function DayCell({
  dateKey,
  dayNum,
  entries,
  onRetime,
  onDelete,
  readOnly,
}: {
  dateKey: string
  dayNum: number
  entries: { idx: number; cand: MonthlyCandidateAppointment }[]
  onRetime?: (index: number, newStartsAt: string, newEndsAt: string) => void
  onDelete?: (index: number) => void
  readOnly?: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dateKey, disabled: readOnly })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[68px] rounded-md border p-1 text-[10px] flex flex-col gap-0.5 transition-colors ${
        isOver
          ? 'border-fm-primary bg-fm-primary/10'
          : 'border-fm-outline-variant/20 bg-fm-surface-container-low/30'
      }`}
    >
      <span className="text-fm-on-surface-variant font-semibold opacity-70">{dayNum}</span>
      {entries.map(({ idx, cand }) => (
        <DraggableCandidate
          key={`${idx}-${cand.starts_at}`}
          idx={idx}
          cand={cand}
          onRetime={onRetime}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}

function DraggableCandidate({
  idx,
  cand,
  onRetime,
  onDelete,
  readOnly,
}: {
  idx: number
  cand: MonthlyCandidateAppointment
  onRetime?: (index: number, newStartsAt: string, newEndsAt: string) => void
  onDelete?: (index: number) => void
  readOnly?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(idx),
    disabled: readOnly,
  })
  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 100 }
    : undefined
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={readOnly ? -1 : 0}
        className={`text-left rounded-sm px-1 py-0.5 text-[9px] leading-tight font-medium border transition-shadow ${
          isDragging
            ? 'shadow-lg bg-fm-primary text-white border-fm-primary opacity-90 cursor-grabbing'
            : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 cursor-grab'
        } ${readOnly ? 'cursor-default' : ''}`}
        title={`${serviceLabel(cand.service)} · ${timeLabel(cand.starts_at)} · ${cand.duration_minutes}m`}
      >
        {!readOnly && onRetime ? (
          <input
            type="time"
            value={timeLabel(cand.starts_at)}
            // Evitar que el input dispare el drag de la cita.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const r = retimeOnDay(cand.starts_at, e.target.value, cand.duration_minutes ?? 30)
              if (r) onRetime(idx, r.startsAt, r.endsAt)
            }}
            className="w-full rounded-sm border border-emerald-300 bg-white/90 px-0.5 font-mono text-[9px] tabular-nums text-emerald-900"
            aria-label="Editar hora de la cita"
          />
        ) : (
          <div className="font-mono tabular-nums">{timeLabel(cand.starts_at)}</div>
        )}
        <div className="truncate">{serviceLabel(cand.service)}</div>
      </div>
      {!readOnly && onDelete && (
        <button
          type="button"
          // Evitar que el pointer-down inicie un drag de la cita.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(idx)
          }}
          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-fm-error text-white text-[10px] leading-none shadow ring-1 ring-white"
          title="Quitar esta cita del ciclo"
          aria-label="Quitar esta cita"
        >
          ✕
        </button>
      )}
    </div>
  )
}
