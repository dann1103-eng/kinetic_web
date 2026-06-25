'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SERVICE_TYPE_LABELS, EXTRA_REASON_LABELS } from '@/types/db'
import type { ServiceType, ExtraReason } from '@/types/db'
import { fromZonedTime } from 'date-fns-tz'
import { setAppointmentExtra, adminUpdateAppointmentTimes } from '@/app/actions/appointments'
import type {
  CompletedTherapiesReport,
  CompletedTherapyRow,
  CompletedGranularity,
} from '@/lib/domain/reports/completed-therapies'

const TZ = 'America/El_Salvador'

const GRANULARITY_LABELS: Record<CompletedGranularity, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
}

const EXTRA_REASONS: ExtraReason[] = ['hora_extra', 'sabado', 'cobertura']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function shiftDate(base: string, granularity: CompletedGranularity, dir: 1 | -1): string {
  const [y, m, d] = base.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (granularity === 'dia') date.setUTCDate(date.getUTCDate() + dir)
  else if (granularity === 'semana') date.setUTCDate(date.getUTCDate() + dir * 7)
  else date.setUTCMonth(date.getUTCMonth() + dir)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function todayParam(): string {
  // Fecha de hoy en zona SV.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date()) // en-CA → YYYY-MM-DD
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Fecha (YYYY-MM-DD) y hora (HH:MM) de un ISO en zona SV, para los inputs. */
function svParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { date, time }
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso))
}

function serviceLabel(s: string | null): string {
  if (!s) return '—'
  return SERVICE_TYPE_LABELS[s as ServiceType] ?? s
}

interface Props {
  report: CompletedTherapiesReport
  granularity: CompletedGranularity
  anchorDate: string
  /** Roles de gestión pueden corregir el tiempo real de cada terapia. */
  canEdit: boolean
}

export function CompletedTherapiesView({ report, granularity, anchorDate, canEdit }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  function navigate(g: CompletedGranularity, d: string) {
    router.push(`${pathname}?g=${g}&d=${d}`)
  }

  function toggleExtra(appointmentId: string, isExtra: boolean, reason: ExtraReason | null) {
    setError(null)
    startTransition(async () => {
      const res = await setAppointmentExtra(appointmentId, isExtra, reason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function startEdit(r: CompletedTherapyRow) {
    setError(null)
    const endIso = new Date(new Date(r.startsAt).getTime() + r.durationMin * 60_000).toISOString()
    setEditingId(r.appointmentId)
    setEditStart(svParts(r.startsAt).time)
    setEditEnd(svParts(endIso).time)
  }

  function saveTimes(r: CompletedTherapyRow) {
    const { date } = svParts(r.startsAt)
    const startISO = fromZonedTime(`${date}T${editStart}:00`, TZ).toISOString()
    const endISO = fromZonedTime(`${date}T${editEnd}:00`, TZ).toISOString()
    setError(null)
    startTransition(async () => {
      const res = await adminUpdateAppointmentTimes(r.appointmentId, startISO, endISO)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setEditingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Controles: granularidad + navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-fm-outline-variant/40 p-0.5 bg-fm-surface-container-low">
          {(['dia', 'semana', 'mes'] as CompletedGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => navigate(g, anchorDate)}
              className={`px-3.5 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                g === granularity
                  ? 'bg-fm-primary text-white'
                  : 'text-fm-on-surface-variant hover:text-fm-on-surface'
              }`}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-fm-on-surface capitalize min-w-[12ch] text-center">
            {report.rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => navigate(granularity, todayParam())}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-fm-surface-container hover:bg-fm-surface-container-high text-fm-on-surface transition-colors"
          >
            Hoy
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => navigate(granularity, shiftDate(anchorDate, granularity, -1))}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => navigate(granularity, shiftDate(anchorDate, granularity, 1))}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-fm-error/30 bg-fm-error/10 px-4 py-2.5 text-sm text-fm-error">
          {error}
        </div>
      )}

      {/* Total a servicios profesionales */}
      <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-low/40 px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-fm-on-surface-variant">
          Total a planilla de <span className="font-semibold text-fm-on-surface">servicios profesionales</span> en este período
        </p>
        <p className="text-lg font-bold tabular-nums text-fm-primary">
          ${report.totalUsd.toFixed(2)}
        </p>
      </div>

      {canEdit && (
        <p className="text-[11px] text-fm-on-surface-variant -mt-2">
          Editá la duración real con el lápiz en la columna <b>Duración</b> si alguien olvidó
          marcar a tiempo. Corrige el conteo de horas; no cambia el pago (servicios profesionales
          se paga por terapia, no por hora).
        </p>
      )}

      {report.groups.length === 0 && (
        <div className="rounded-2xl border border-fm-outline-variant/30 px-4 py-8 text-center text-sm text-fm-on-surface-variant">
          No hay terapias completadas en este período.
        </div>
      )}

      {report.groups.map((g) => (
        <div
          key={g.therapistId}
          className="rounded-2xl border border-fm-outline-variant/30 overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-fm-surface-container-low/50 border-b border-fm-outline-variant/20">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-fm-on-surface">{g.fullName}</h3>
              {g.inProfessionalServices ? (
                g.extraOnly ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    Solo extras → SP
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                    Todas → SP
                  </span>
                )
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
                  No SP
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-fm-on-surface-variant">
              <span>{g.completedCount} terapias</span>
              <span>{g.totalHours}h</span>
              {g.inProfessionalServices && (
                <span className="font-semibold text-fm-primary tabular-nums">
                  {g.payableCount} a SP · ${g.amountUsd.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fm-on-surface-variant border-b border-fm-outline-variant/20">
                <th className="text-left font-semibold px-4 py-2">Fecha</th>
                <th className="text-left font-semibold px-2 py-2">Niño/a</th>
                <th className="text-left font-semibold px-2 py-2">Terapia</th>
                <th className="text-right font-semibold px-2 py-2">Duración</th>
                <th className="text-right font-semibold px-2 py-2">Tarifa</th>
                <th className="text-left font-semibold px-4 py-2">Extraordinaria</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.appointmentId} className="border-b border-fm-outline-variant/10 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="capitalize">{dayLabel(r.startsAt)}</span>
                    <span className="text-fm-on-surface-variant"> · {timeLabel(r.startsAt)}</span>
                  </td>
                  <td className="px-2 py-2">
                    {r.childName}
                    {r.reassignedFromName && (
                      <span
                        className="ml-1.5 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-900 dark:bg-violet-400/20 dark:text-violet-300"
                        title={`Cobertura — reasignada de ${r.reassignedFromName}`}
                      >
                        Cobertura
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{serviceLabel(r.serviceType)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {editingId === r.appointmentId ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="time"
                          value={editStart}
                          disabled={pending}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="rounded border border-fm-outline-variant/40 bg-fm-surface px-1 py-0.5 text-xs tabular-nums"
                        />
                        <span className="text-fm-on-surface-variant">–</span>
                        <input
                          type="time"
                          value={editEnd}
                          disabled={pending}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="rounded border border-fm-outline-variant/40 bg-fm-surface px-1 py-0.5 text-xs tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => saveTimes(r)}
                          disabled={pending}
                          className="text-fm-primary p-0.5 disabled:opacity-50"
                          aria-label="Guardar tiempo"
                        >
                          <span className="material-symbols-outlined text-[18px]">check</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={pending}
                          className="text-fm-on-surface-variant p-0.5 disabled:opacity-50"
                          aria-label="Cancelar"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span className="tabular-nums text-fm-on-surface">{Math.round(r.durationMin)} min</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            disabled={pending}
                            className="text-fm-on-surface-variant hover:text-fm-primary p-0.5 disabled:opacity-50"
                            aria-label="Editar tiempo"
                            title="Editar tiempo"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-fm-on-surface-variant">
                    ${r.costUsd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={r.isExtra}
                          disabled={pending}
                          onChange={(e) =>
                            toggleExtra(
                              r.appointmentId,
                              e.target.checked,
                              e.target.checked ? r.extraReason ?? 'cobertura' : null,
                            )
                          }
                          className="h-4 w-4 rounded border-fm-outline-variant text-fm-primary focus:ring-fm-primary"
                        />
                        <span className="text-xs text-fm-on-surface-variant">Extra</span>
                      </label>
                      {r.isExtra && (
                        <select
                          value={r.extraReason ?? 'cobertura'}
                          disabled={pending}
                          onChange={(e) =>
                            toggleExtra(r.appointmentId, true, e.target.value as ExtraReason)
                          }
                          className="text-xs rounded-md border border-fm-outline-variant/50 bg-fm-surface px-1.5 py-1 text-fm-on-surface"
                        >
                          {EXTRA_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {EXTRA_REASON_LABELS[reason]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
