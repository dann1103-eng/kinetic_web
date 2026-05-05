'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { format, isSameDay, parseISO, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageItem } from './MessageItem'
import { useConversationMessages } from '@/hooks/useInboxPolling'
import { markConversationRead } from '@/app/actions/inbox'
import type { MessageWithMeta } from '@/types/db'

interface MessageListProps {
  conversationId: string
  currentUserId: string
  isAdmin?: boolean
  initialMessages: MessageWithMeta[]
  initialDayKey: string | null
  initialHasMoreBefore: boolean
}

function dayLabel(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  return format(d, "d 'de' MMMM", { locale: es })
}

export function MessageList({
  conversationId,
  currentUserId,
  isAdmin = false,
  initialMessages,
  initialDayKey,
  initialHasMoreBefore,
}: MessageListProps) {
  const {
    messages,
    removeMessage,
    updateMessage,
    loadPreviousDay,
    hasMoreBefore,
    loadingPrevious,
  } = useConversationMessages(conversationId, initialMessages, initialDayKey, initialHasMoreBefore)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastCountRef = useRef(messages.length)
  const initialScrolledRef = useRef(false)

  // Auto-scroll al fondo cuando llegan mensajes nuevos y el usuario ya estaba cerca del fondo
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 160
    if (messages.length > lastCountRef.current && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    lastCountRef.current = messages.length
  }, [messages.length])

  // Scroll inicial al fondo. Usamos useLayoutEffect + 2x rAF para que dispare
  // DESPUÉS de que el navegador haya layouted los mensajes (incluyendo imágenes
  // con tamaño intrínseco), evitando que el scroll caiga "a mitad" porque la
  // altura aún no estaba calculada.
  useLayoutEffect(() => {
    initialScrolledRef.current = false
    const doScroll = () => {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
    doScroll()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doScroll()
        initialScrolledRef.current = true
      })
    })
  }, [conversationId])

  // Marcar leído al montar y cada vez que llegue un mensaje mientras la pestaña está visible
  useEffect(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      markConversationRead(conversationId)
    }
  }, [conversationId, messages.length])

  const groups = useMemo(() => {
    const out: Array<{ date: string; items: MessageWithMeta[] }> = []
    for (const m of messages) {
      const last = out[out.length - 1]
      if (last && isSameDay(parseISO(last.date), parseISO(m.created_at))) {
        last.items.push(m)
      } else {
        out.push({ date: m.created_at, items: [m] })
      }
    }
    return out
  }, [messages])

  /**
   * Carga el día anterior preservando la posición de scroll del usuario:
   * antes de prepender, capturamos `scrollHeight`. Tras renderizar los nuevos
   * mensajes, restauramos `scrollTop` para que el primer mensaje visible
   * antes del click siga siendo el primer mensaje visible.
   */
  async function handleLoadPrevious() {
    const c = containerRef.current
    if (!c || loadingPrevious) return
    const beforeScrollHeight = c.scrollHeight
    const beforeScrollTop = c.scrollTop
    const prepended = await loadPreviousDay()
    if (prepended === 0) return
    requestAnimationFrame(() => {
      const node = containerRef.current
      if (!node) return
      const delta = node.scrollHeight - beforeScrollHeight
      node.scrollTop = beforeScrollTop + delta
    })
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-6 space-y-6 bg-fm-background"
    >
      {hasMoreBefore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadPrevious}
            disabled={loadingPrevious}
            className="px-3 py-1.5 rounded-full bg-fm-surface-container-lowest border border-fm-surface-container-high text-fm-on-surface-variant text-xs font-semibold hover:bg-fm-primary/5 hover:text-fm-primary disabled:opacity-50 transition-colors"
          >
            {loadingPrevious ? 'Cargando…' : '↑ Cargar día anterior'}
          </button>
        </div>
      )}
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-center text-fm-on-surface-variant/70 text-sm">
          No hay mensajes aún. Envía el primero.
        </div>
      )}
      {groups.map((g) => (
        <div key={g.date} className="space-y-5">
          <div className="flex justify-center">
            <span className="px-3 py-1 rounded-full bg-fm-surface-container-lowest border border-fm-surface-container-high text-fm-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
              {dayLabel(g.date)}
            </span>
          </div>
          {g.items.map((m) => {
            if (m.kind === 'system_missed_call') {
              const isFromMe = m.user_id === currentUserId
              return <SystemMissedCallRow key={m.id} createdAt={m.created_at} isFromMe={isFromMe} />
            }
            return (
              <MessageItem
                key={m.id}
                message={m}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onDeleted={() => removeMessage(m.id)}
                onUpdated={(patch) => updateMessage(m.id, patch)}
              />
            )
          })}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function SystemMissedCallRow({ createdAt, isFromMe }: { createdAt: string; isFromMe: boolean }) {
  const time = format(parseISO(createdAt), 'HH:mm')
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fm-error/10 border border-fm-error/20 text-fm-error text-xs">
        <span className="material-symbols-outlined text-base">phone_missed</span>
        <span>{isFromMe ? 'Llamaste y no contestaron' : 'Llamada perdida'}</span>
        <span className="text-fm-error/70">· {time}</span>
      </div>
    </div>
  )
}
