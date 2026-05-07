'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateCalendarEvent, deleteCalendarEvent } from '@/app/actions/calendar'

export interface EditEventInitial {
  source: 'requirement' | 'time_entry'
  id: string
  title: string
  startsAt: string // datetime-local value
  durationMinutes: number
  attendees: string[]
  notes?: string | null
  /** Si es requirement, el cliente al que pertenece (read-only). */
  clientName?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial: EditEventInitial | null
  allUsers: { id: string; full_name: string; avatar_url: string | null }[]
}

export function EditEventModal({ open, onClose, initial, allUsers }: Props) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [duration, setDuration] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Hidratar cuando se abre
  if (open && initial && title === '' && startsAt === '' && duration === '') {
    setTitle(initial.title)
    setStartsAt(initial.startsAt)
    setDuration(String(initial.durationMinutes))
    setAttendees(initial.attendees)
    setNotes(initial.notes ?? '')
  }

  function handleClose() {
    setTitle('')
    setStartsAt('')
    setDuration('')
    setAttendees([])
    setNotes('')
    setError(null)
    setConfirmDelete(false)
    onClose()
  }

  function handleSave() {
    if (!initial) return
    setError(null)
    if (!title.trim()) { setError('El título es obligatorio.'); return }
    if (!startsAt) { setError('La fecha y hora son obligatorias.'); return }
    const mins = parseInt(duration, 10)
    if (!mins || isNaN(mins) || mins < 1) { setError('La duración es obligatoria.'); return }
    if (attendees.length === 0) { setError('Selecciona al menos un participante.'); return }

    startTransition(async () => {
      const r = await updateCalendarEvent({
        source: initial.source,
        id: initial.id,
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        duration_minutes: mins,
        attendees,
        notes: notes.trim() || null,
      })
      if (r.error) { setError(r.error); return }
      handleClose()
    })
  }

  function handleDelete() {
    if (!initial) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await deleteCalendarEvent({ source: initial.source, id: initial.id })
      if (r.error) { setError(r.error); return }
      handleClose()
    })
  }

  if (!initial) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] rounded-2xl border border-fm-outline-variant/20 shadow-xl p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-fm-surface-container-low flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-fm-on-surface">
            Editar {initial.source === 'requirement' ? 'requerimiento' : 'reunión interna'}
          </DialogTitle>
          {initial.clientName && (
            <p className="text-xs text-fm-on-surface-variant mt-0.5">
              Cliente: <span className="font-semibold">{initial.clientName}</span>
            </p>
          )}
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <Label className="text-sm font-medium text-fm-on-surface mb-1.5 block">
              Título <span className="text-fm-error">*</span>
            </Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary text-fm-on-surface"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-fm-on-surface mb-1.5 block">
              Fecha y hora <span className="text-fm-error">*</span>
            </Label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary text-fm-on-surface"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-fm-on-surface mb-1.5 block">
              Duración (min) <span className="text-fm-error">*</span>
            </Label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary text-fm-on-surface"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-fm-on-surface mb-1.5 block">
              Participantes <span className="text-fm-error">*</span>
            </Label>
            <div className="bg-fm-background border border-fm-surface-container-high rounded-xl px-3 py-2 space-y-1.5 max-h-40 overflow-y-auto">
              {allUsers.map((u) => {
                const checked = attendees.includes(u.id)
                return (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAttendees((prev) =>
                          checked ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                        )
                      }
                      className="rounded accent-fm-primary"
                    />
                    <span className="text-sm text-fm-on-surface">{u.full_name}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-fm-on-surface mb-1.5 block">
              Notas <span className="text-fm-outline font-normal">(opcional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none bg-fm-background border-fm-surface-container-high focus:border-fm-primary rounded-xl"
              rows={3}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-fm-surface-container-low flex-shrink-0 space-y-3">
          {error && (
            <p className="text-sm text-fm-error bg-fm-error/5 rounded-xl px-3 py-2 border border-fm-error/20">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              variant="outline"
              className="rounded-xl text-fm-error border-fm-error/30 hover:bg-fm-error/5"
            >
              {confirmDelete ? '¿Confirmar borrar?' : 'Borrar'}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isPending} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #1FA4DA 0%, #87daff 100%)' }}
              >
                {isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
