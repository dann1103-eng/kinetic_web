'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertScheduleBlock,
  deleteScheduleBlock,
  setMaxHoursPerWeek,
} from '@/app/actions/therapist-schedules'
import type { TherapistWorkScheduleBlock } from '@/types/db'

interface TherapistWithBlocks {
  id: string
  full_name: string
  max_hours_per_week: number | null
  blocks: TherapistWorkScheduleBlock[]
}

interface Props {
  therapist: TherapistWithBlocks
  onClose: () => void
}

const DAYS = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' },
]

function trimSeconds(t: string): string {
  // "08:00:00" → "08:00"
  return t.length >= 5 ? t.slice(0, 5) : t
}

export function EditTherapistScheduleModal({ therapist, onClose }: Props) {
  const router = useRouter()
  const [maxHours, setMaxHours] = useState<string>(
    therapist.max_hours_per_week != null ? String(therapist.max_hours_per_week) : '',
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Estado local de bloques (id puede ser undefined para los nuevos sin guardar)
  const [draftBlocks, setDraftBlocks] = useState<{
    key: string
    id?: string
    day_of_week: number
    start_time: string
    end_time: string
  }[]>(
    therapist.blocks.map((b) => ({
      key: b.id,
      id: b.id,
      day_of_week: b.day_of_week,
      start_time: trimSeconds(b.start_time),
      end_time: trimSeconds(b.end_time),
    })),
  )

  function addBlock(dow: number) {
    setDraftBlocks((prev) => [
      ...prev,
      {
        key: `new-${dow}-${Date.now()}`,
        day_of_week: dow,
        start_time: '08:00',
        end_time: '12:00',
      },
    ])
  }

  function updateBlock(key: string, patch: Partial<{ start_time: string; end_time: string }>) {
    setDraftBlocks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    )
  }

  function removeBlockLocal(key: string) {
    setDraftBlocks((prev) => prev.filter((b) => b.key !== key))
  }

  async function handleSave() {
    setError(null)
    startTransition(async () => {
      // 1) Guardar max_hours_per_week
      const hours = maxHours.trim() === '' ? null : Number(maxHours)
      if (hours != null && Number.isNaN(hours)) {
        setError('Horas semanales inválidas.')
        return
      }
      const resMax = await setMaxHoursPerWeek(therapist.id, hours)
      if (!resMax.ok) {
        setError(resMax.error)
        return
      }

      // 2) Para cada bloque del draft: upsert
      for (const b of draftBlocks) {
        const res = await upsertScheduleBlock({
          id: b.id,
          therapistId: therapist.id,
          dayOfWeek: b.day_of_week,
          startTime: b.start_time,
          endTime: b.end_time,
        })
        if (!res.ok) {
          setError(`Bloque ${DAYS.find((d) => d.dow === b.day_of_week)?.label}: ${res.error}`)
          return
        }
      }

      // 3) Borrar los que estaban antes y ya no están en el draft
      const draftIds = new Set(draftBlocks.map((b) => b.id).filter(Boolean))
      const toDelete = therapist.blocks.filter((b) => !draftIds.has(b.id))
      for (const b of toDelete) {
        const res = await deleteScheduleBlock(b.id)
        if (!res.ok) {
          setError(`Error al borrar bloque: ${res.error}`)
          return
        }
      }

      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-fm-on-surface">
              Horario de {therapist.full_name}
            </h3>
            <p className="text-xs text-fm-on-surface-variant mt-1">
              Definí los bloques laborales por día. Múltiples bloques permiten un break de almuerzo.
            </p>
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

        {/* Max hours */}
        <div className="rounded-xl bg-fm-surface-container-low/50 p-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1.5">
            Máximo de horas semanales (opcional)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={maxHours}
            onChange={(e) => setMaxHours(e.target.value)}
            placeholder="Ej: 40"
            className="w-32 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
          />
          <p className="text-[11px] text-fm-on-surface-variant mt-1">
            Si lo definís, se alerta cuando supere este tope.
          </p>
        </div>

        {/* Días */}
        <div className="space-y-2">
          {DAYS.map((day) => {
            const blocks = draftBlocks
              .filter((b) => b.day_of_week === day.dow)
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
            return (
              <div key={day.dow} className="rounded-xl border border-fm-outline-variant/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-fm-on-surface">{day.label}</p>
                  <button
                    type="button"
                    onClick={() => addBlock(day.dow)}
                    className="text-xs font-semibold text-fm-primary hover:underline"
                  >
                    + Agregar bloque
                  </button>
                </div>
                {blocks.length === 0 ? (
                  <p className="text-xs italic text-fm-on-surface-variant">No trabaja</p>
                ) : (
                  <div className="space-y-2">
                    {blocks.map((b) => (
                      <div key={b.key} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={b.start_time}
                          onChange={(e) => updateBlock(b.key, { start_time: e.target.value })}
                          className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums"
                        />
                        <span className="text-fm-on-surface-variant text-sm">–</span>
                        <input
                          type="time"
                          value={b.end_time}
                          onChange={(e) => updateBlock(b.key, { end_time: e.target.value })}
                          className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => removeBlockLocal(b.key)}
                          className="ml-auto text-fm-error hover:bg-fm-error/10 px-2 py-1 rounded text-xs font-semibold"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-fm-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
