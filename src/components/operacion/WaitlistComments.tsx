'use client'

import { useEffect, useState, useTransition } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  listWaitlistComments,
  addWaitlistComment,
  type WaitlistCommentView,
} from '@/app/actions/waitlist'

/**
 * Hilo de comentarios / bitácora de una entrada de lista de espera. Permite al
 * equipo (coordinadoras, recepción, dirección) dejar indicaciones breves sobre
 * el proceso de ingreso: enviar propuesta, proponer días/horas, seguimiento…
 * Carga los comentarios al montar y permite agregar nuevos.
 */
export function WaitlistComments({ entryId }: { entryId: string }) {
  const [comments, setComments] = useState<WaitlistCommentView[] | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    listWaitlistComments(entryId)
      .then((rows) => {
        if (!cancelled) setComments(rows)
      })
      .catch(() => {
        if (!cancelled) setComments([])
      })
    return () => {
      cancelled = true
    }
  }, [entryId])

  function submit() {
    const trimmed = body.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const res = await addWaitlistComment(entryId, trimmed)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setComments((prev) => [...(prev ?? []), res.comment])
      setBody('')
    })
  }

  return (
    <section className="space-y-3 border-t border-fm-outline-variant/15 pt-4">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
        Comentarios del equipo
      </h4>

      {comments === null ? (
        <p className="text-xs text-fm-on-surface-variant/70">Cargando…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-fm-on-surface-variant/70 italic">
          Sin comentarios todavía. Deja la primera indicación de seguimiento.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-fm-on-surface">
                  {c.author_name ?? 'Usuario'}
                </span>
                <span className="text-[10px] text-fm-on-surface-variant/70">
                  {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true, locale: es })}
                </span>
              </div>
              <p className="text-fm-on-surface-variant whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Escribe una indicación o actualización…"
          className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary resize-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        {error && <p role="alert" className="text-xs text-fm-error">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="min-h-[36px] px-4 py-1.5 text-sm rounded-xl bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim disabled:opacity-40"
          >
            {pending ? 'Guardando…' : 'Comentar'}
          </button>
        </div>
      </div>
    </section>
  )
}
