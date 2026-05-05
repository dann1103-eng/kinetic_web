'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  approveRequirementRequest,
  rejectRequirementRequest,
} from '@/app/actions/requirementRequests'
import type { Priority } from '@/types/db'

export interface PendingRequest {
  id: string
  title: string
  notes: string | null
  content_type: string
  client_requested_deadline: string | null
  starts_at: string | null
  deadline: string | null
  client_name: string
  requested_by_name: string
}

const SCHEDULED = ['reunion', 'produccion']

interface Props {
  request: PendingRequest
  assignableUsers: { id: string; full_name: string }[]
  open: boolean
  onClose: () => void
}

export function ApproveRequestModal({ request, assignableUsers, open, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')

  const isScheduled = SCHEDULED.includes(request.content_type)
  const initialStart = request.starts_at ?? request.client_requested_deadline ?? ''
  const initialDeadline = request.deadline
    ?? (request.client_requested_deadline ? request.client_requested_deadline.slice(0, 10) : '')
  const [startsAt, setStartsAt] = useState(
    isScheduled && initialStart ? toLocalInputValue(initialStart) : '',
  )
  const [estimatedHours, setEstimatedHours] = useState(1)
  const [estimatedMinutes, setEstimatedMinutes] = useState(0)
  const [priority, setPriority] = useState<Priority>('media')
  const [assigned, setAssigned] = useState<string[]>([])
  const [deadline, setDeadline] = useState(isScheduled ? '' : initialDeadline)
  const [rejectReason, setRejectReason] = useState('')

  if (!open) return null

  function toggleAssigned(id: string) {
    setAssigned((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (assigned.length === 0) { setError('Asigna al menos un responsable'); return }

    if (isScheduled) {
      const totalMin = estimatedHours * 60 + estimatedMinutes
      if (totalMin <= 0) { setError('Ingresa la duración estimada'); return }
      if (!startsAt) { setError('Selecciona la fecha y hora de inicio'); return }
      startTransition(async () => {
        const r = await approveRequirementRequest({
          requirementId: request.id,
          estimatedTimeMinutes: totalMin,
          priority,
          assignedTo: assigned,
          deadline: deadline || null,
          startsAt,
        })
        if ('error' in r) { setError(r.error); return }
        onClose()
        router.refresh()
      })
    } else {
      if (!deadline) { setError('Selecciona la fecha de entrega'); return }
      startTransition(async () => {
        const r = await approveRequirementRequest({
          requirementId: request.id,
          estimatedTimeMinutes: null,
          priority,
          assignedTo: assigned,
          deadline,
          startsAt: null,
        })
        if ('error' in r) { setError(r.error); return }
        onClose()
        router.refresh()
      })
    }
  }

  function handleReject() {
    setError(null)
    if (!rejectReason.trim()) { setError('Indica un motivo de rechazo'); return }
    startTransition(async () => {
      const r = await rejectRequirementRequest(request.id, rejectReason)
      if ('error' in r) { setError(r.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant">
            Solicitud · {request.client_name}
          </p>
          <h2 className="text-lg font-semibold text-fm-on-surface mt-1">{request.title}</h2>
          <p className="text-xs text-fm-on-surface-variant mt-1">
            Tipo: {labelForType(request.content_type)}
            {' · Solicitado por '}{request.requested_by_name}
          </p>
        </div>

        {request.notes && (
          <div className="rounded-xl bg-fm-background border border-fm-surface-container-high p-3">
            <p className="text-xs font-semibold text-fm-on-surface-variant uppercase tracking-wide mb-1">
              Descripción del cliente
            </p>
            <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}

        {request.client_requested_deadline && (
          <p className="text-xs text-fm-on-surface-variant">
            Fecha deseada por el cliente:{' '}
            <span className="font-semibold text-fm-on-surface">
              {new Date(request.client_requested_deadline).toLocaleString('es-SV')}
            </span>
          </p>
        )}

        <div className="inline-flex rounded-xl border border-fm-surface-container-high p-0.5 bg-fm-background">
          <button
            type="button"
            onClick={() => setMode('approve')}
            disabled={isPending}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
              mode === 'approve' ? 'bg-fm-primary/10 text-fm-primary' : 'text-fm-on-surface-variant'
            }`}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setMode('reject')}
            disabled={isPending}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
              mode === 'reject' ? 'bg-fm-error/10 text-fm-error' : 'text-fm-on-surface-variant'
            }`}
          >
            Rechazar
          </button>
        </div>

        {mode === 'approve' ? (
          <form onSubmit={handleApprove} className="space-y-4">
            {isScheduled && (
              <>
                <div className="space-y-1.5">
                  <Label>Fecha y hora final *</Label>
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    disabled={isPending}
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Duración (horas)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(Math.max(0, Number(e.target.value)))}
                      disabled={isPending}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duración (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
                      disabled={isPending}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Urgencia *</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['baja', 'media', 'alta'] as const).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(p)}
                    disabled={isPending}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border ${
                      priority === p
                        ? 'bg-fm-primary/10 text-fm-primary border-fm-primary/30'
                        : 'border-fm-surface-container-high text-fm-on-surface-variant'
                    }`}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Asignar a *</Label>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-fm-surface-container-high bg-fm-background p-2 space-y-1">
                {assignableUsers.length === 0 ? (
                  <p className="text-xs text-fm-on-surface-variant">No hay usuarios disponibles.</p>
                ) : (
                  assignableUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-fm-surface-container-low cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assigned.includes(u.id)}
                        onChange={() => toggleAssigned(u.id)}
                        disabled={isPending}
                        className="h-4 w-4 accent-fm-primary"
                      />
                      <span className="text-sm text-fm-on-surface">{u.full_name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de entrega {isScheduled ? '(opcional)' : '*'}</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={isPending}
                required={!isScheduled}
                className="rounded-xl"
              />
            </div>

            {error && (
              <p className="text-sm text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button type="button" onClick={onClose} disabled={isPending} variant="outline" className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #00675c 0%, #5bf4de 100%)' }}
              >
                {isPending ? 'Aprobando…' : 'Aprobar y agendar'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <Label>Motivo del rechazo</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="Explica al cliente por qué no podemos atender la solicitud…"
              className="rounded-xl"
            />
            {error && (
              <p className="text-sm text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20">
                {error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" onClick={onClose} disabled={isPending} variant="outline" className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="rounded-xl text-white font-semibold bg-fm-error hover:bg-fm-error/90"
              >
                {isPending ? 'Rechazando…' : 'Rechazar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function labelForType(t: string): string {
  switch (t) {
    case 'reunion': return 'Reunión'
    case 'produccion': return 'Producción'
    case 'historia': return 'Historia'
    case 'estatico': return 'Estático'
    case 'video_corto': return 'Video corto'
    case 'reel': return 'Video largo'
    case 'short': return 'Short'
    default: return t
  }
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
