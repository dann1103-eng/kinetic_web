'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { requestRequirement } from '@/app/actions/requirementRequests'

interface Props {
  open: boolean
  onClose: () => void
}

type ReqKind = 'reunion' | 'produccion'

export function ClientRequestRequirementModal({ open, onClose }: Props) {
  const router = useRouter()
  const [contentType, setContentType] = useState<ReqKind>('reunion')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [desiredAt, setDesiredAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  function reset() {
    setContentType('reunion')
    setTitle('')
    setDescription('')
    setDesiredAt('')
    setError(null)
    setSuccess(false)
  }

  function handleClose() {
    if (isPending) return
    reset()
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Ingresa un título'); return }
    if (!desiredAt) { setError('Selecciona la fecha y hora deseada'); return }

    startTransition(async () => {
      const r = await requestRequirement({
        contentType,
        title: title.trim(),
        description: description.trim(),
        desiredAt,
      })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-fm-on-surface">Solicitar requerimiento</h2>

        {success ? (
          <div className="space-y-4">
            <div className="bg-fm-primary/10 border border-fm-primary/20 rounded-xl p-4 text-sm text-fm-primary">
              Tu solicitud fue enviada al equipo. Te avisaremos cuando sea aprobada con los detalles
              definitivos (horario final, duración y responsables).
            </div>
            <Button onClick={handleClose} className="rounded-xl w-full">Cerrar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-fm-on-surface-variant">
              Completa estos campos básicos. El equipo de FM revisará la solicitud y confirmará
              los tiempos, recursos y horario definitivo.
            </p>

            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setContentType('reunion')}
                  disabled={isPending}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                    contentType === 'reunion'
                      ? 'bg-fm-primary/10 text-fm-primary border-fm-primary/30'
                      : 'border-fm-surface-container-high text-fm-on-surface-variant hover:bg-fm-background'
                  }`}
                >
                  Reunión
                </button>
                <button
                  type="button"
                  onClick={() => setContentType('produccion')}
                  disabled={isPending}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                    contentType === 'produccion'
                      ? 'bg-fm-primary/10 text-fm-primary border-fm-primary/30'
                      : 'border-fm-surface-container-high text-fm-on-surface-variant hover:bg-fm-background'
                  }`}
                >
                  Producción
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
                required
                placeholder="Ej: Reunión de planeación trimestral"
                className="rounded-xl bg-fm-background border-fm-surface-container-high"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
                rows={3}
                placeholder="Cuéntanos el contexto, lo que esperas de esta reunión/producción…"
                className="rounded-xl bg-fm-background border-fm-surface-container-high"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Fecha y hora deseada *</Label>
              <Input
                type="datetime-local"
                value={desiredAt}
                onChange={(e) => setDesiredAt(e.target.value)}
                disabled={isPending}
                required
                className="rounded-xl bg-fm-background border-fm-surface-container-high"
              />
              <p className="text-xs text-fm-outline">
                El equipo confirmará si esta fecha es posible y te avisará el horario definitivo.
              </p>
            </div>

            {error && (
              <p className="text-sm text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" onClick={handleClose} disabled={isPending} variant="outline" className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #00675c 0%, #5bf4de 100%)' }}
              >
                {isPending ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
