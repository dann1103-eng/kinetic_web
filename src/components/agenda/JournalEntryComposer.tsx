'use client'

import { useRef, useState, useTransition } from 'react'
import { createJournalEntry } from '@/app/actions/child-journal'
import type { JournalCategory } from '@/types/db'

interface JournalEntryComposerProps {
  childId: string
  isFamily: boolean
  linkedAppointmentId?: string
}

const STAFF_CATEGORIES: { value: JournalCategory; label: string }[] = [
  { value: 'home_exercise', label: 'Ejercicio en casa' },
  { value: 'observation',   label: 'Observación' },
  { value: 'question',      label: 'Pregunta' },
  { value: 'response',      label: 'Respuesta' },
]

export function JournalEntryComposer({ childId, isFamily, linkedAppointmentId }: JournalEntryComposerProps) {
  const [category, setCategory] = useState<JournalCategory>(isFamily ? 'response' : 'home_exercise')
  const [visibleToFamily, setVisibleToFamily] = useState(true)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleCategoryChange(cat: JournalCategory) {
    setCategory(cat)
    if (!isFamily) {
      // Default visibility per category
      setVisibleToFamily(cat === 'home_exercise' || cat === 'question')
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = (new FormData(e.currentTarget).get('body') as string)?.trim()
    if (!body) return

    startTransition(async () => {
      const result = await createJournalEntry({
        childId,
        category,
        body,
        visibleToFamily,
        linkedAppointmentId,
      })
      if (result.ok) {
        formRef.current?.reset()
        setCategory(isFamily ? 'response' : 'home_exercise')
        setVisibleToFamily(true)
      } else {
        alert(result.error)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {!isFamily && (
        <div className="flex flex-wrap gap-2">
          {STAFF_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => handleCategoryChange(c.value)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                category === c.value
                  ? 'bg-fm-primary text-white border-fm-primary'
                  : 'border-fm-outline-variant/40 text-fm-on-surface-variant hover:bg-fm-surface-container'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        name="body"
        required
        rows={3}
        placeholder={isFamily ? 'Escribe tu respuesta o comentario…' : 'Escribe la nota…'}
        className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 resize-none focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
      />

      <div className="flex items-center justify-between gap-3">
        {!isFamily && (
          <label className="flex items-center gap-2 text-xs text-fm-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visibleToFamily}
              onChange={(e) => setVisibleToFamily(e.target.checked)}
              className="rounded"
            />
            Visible para la familia
          </label>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="ml-auto px-4 py-2 rounded-xl bg-fm-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-fm-primary/90 transition-colors"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
