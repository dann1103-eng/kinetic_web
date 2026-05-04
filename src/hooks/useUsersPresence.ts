'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EffectivePresenceStatus, PresenceStatus } from '@/types/db'

interface ActiveCallRow {
  user_id: string
  session_id: string
  left_at: string | null
  session: {
    id: string
    conversation_id: string
    ended_at: string | null
  }
}

interface PresenceRow {
  user_id: string
  status: PresenceStatus
}

/**
 * Resultado del hook: por cada user_id devuelve el estado efectivo
 * (manual + override "en_llamada" si está en una sesión activa).
 *
 * Suscribe realtime a:
 *   - user_presence (manual status changes)
 *   - call_participants (entradas/salidas de llamadas)
 *
 * Refrescos minimales — solo refetcha cuando hay un cambio real.
 */
export function useUsersPresence() {
  const [presence, setPresence] = useState<Map<string, PresenceStatus>>(new Map())
  const [inCall, setInCall] = useState<Set<string>>(new Set())
  const [activeConvCalls, setActiveConvCalls] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const supabase = createClient()

    // Manual presence
    const { data: presRows } = await supabase
      .from('user_presence')
      .select('user_id, status')
    const presMap = new Map<string, PresenceStatus>()
    for (const r of (presRows ?? []) as PresenceRow[]) {
      presMap.set(r.user_id, r.status)
    }
    setPresence(presMap)

    // En llamada: usuarios con un call_participants row sin left_at sobre
    // una sesión sin ended_at. Hacemos join inline porque RLS permite ver
    // call_participants y call_sessions de conversaciones donde sea miembro.
    const { data: activeRows } = await supabase
      .from('call_participants')
      .select('user_id, session_id, left_at, session:call_sessions!inner(id, conversation_id, ended_at)')
      .is('left_at', null)
      .is('session.ended_at', null)

    const inCallSet = new Set<string>()
    const convCallSet = new Set<string>()
    for (const r of (activeRows ?? []) as unknown as ActiveCallRow[]) {
      inCallSet.add(r.user_id)
      if (r.session?.conversation_id) {
        convCallSet.add(r.session.conversation_id)
      }
    }
    setInCall(inCallSet)
    setActiveConvCalls(convCallSet)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    refresh()

    const presenceChannel = supabase
      .channel('presence-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        refresh
      )
      .subscribe()

    const callsChannel = supabase
      .channel('calls-presence-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_participants' },
        refresh
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_sessions' },
        refresh
      )
      .subscribe()

    // Safety poll cada 60s — robustez si el WebSocket se desconecta.
    const safetyTimer = window.setInterval(refresh, 60_000)

    return () => {
      window.clearInterval(safetyTimer)
      supabase.removeChannel(presenceChannel)
      supabase.removeChannel(callsChannel)
    }
  }, [refresh])

  /** Estado efectivo: en_llamada override sobre el manual. */
  const getEffective = useCallback(
    (userId: string): EffectivePresenceStatus => {
      if (inCall.has(userId)) return 'en_llamada'
      return presence.get(userId) ?? 'online'
    },
    [inCall, presence]
  )

  /** True si la conversación tiene una sesión de llamada activa. */
  const isConvInCall = useCallback(
    (conversationId: string): boolean => activeConvCalls.has(conversationId),
    [activeConvCalls]
  )

  return { presence, inCall, activeConvCalls, getEffective, isConvInCall, refresh }
}
