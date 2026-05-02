import { NextResponse } from 'next/server'
import { WebhookReceiver } from 'livekit-server-sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { conversationIdFromRoomName } from '@/lib/livekit/rooms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Recibe eventos de LiveKit (room_started, room_finished, participant_joined,
 * participant_left). Cierra call_sessions y rellena left_at en call_participants
 * sin depender de que el cliente envíe explícitamente el "colgar".
 *
 * Configurar la URL en LiveKit Dashboard → Settings → Webhooks:
 *   https://crm.tudominio.com/api/livekit/webhook
 * Y la API_KEY/SECRET deben ser las mismas que LIVEKIT_API_KEY/LIVEKIT_API_SECRET.
 */
export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'LIVEKIT_API_KEY / SECRET no configurados' },
      { status: 500 }
    )
  }

  const receiver = new WebhookReceiver(apiKey, apiSecret)

  const authHeader = req.headers.get('authorization') ?? ''
  const rawBody = await req.text()

  let event
  try {
    event = await receiver.receive(rawBody, authHeader)
  } catch (e) {
    console.error('LiveKit webhook signature inválida:', e)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    if (event.event === 'room_finished' && event.room) {
      const conversationId = conversationIdFromRoomName(event.room.name)
      if (conversationId) {
        // Cierra todas las sesiones activas de esta conversación
        await admin
          .from('call_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .is('ended_at', null)

        // Marca left_at en participantes que no lo tienen
        const { data: sessions } = await admin
          .from('call_sessions')
          .select('id')
          .eq('conversation_id', conversationId)

        if (sessions && sessions.length > 0) {
          await admin
            .from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .in('session_id', sessions.map((s) => s.id))
            .is('left_at', null)
        }
      }
    } else if (event.event === 'participant_left' && event.room && event.participant) {
      const conversationId = conversationIdFromRoomName(event.room.name)
      const userId = event.participant.identity
      if (conversationId && userId) {
        const { data: activeSession } = await admin
          .from('call_sessions')
          .select('id')
          .eq('conversation_id', conversationId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (activeSession) {
          await admin
            .from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('session_id', activeSession.id)
            .eq('user_id', userId)
            .is('left_at', null)
        }
      }
    } else if (event.event === 'participant_joined' && event.room && event.participant) {
      const conversationId = conversationIdFromRoomName(event.room.name)
      const userId = event.participant.identity
      if (conversationId && userId) {
        const { data: activeSession } = await admin
          .from('call_sessions')
          .select('id')
          .eq('conversation_id', conversationId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (activeSession) {
          // Idempotente: si ya hay un row sin left_at no lo dupliques
          const { data: existing } = await admin
            .from('call_participants')
            .select('session_id')
            .eq('session_id', activeSession.id)
            .eq('user_id', userId)
            .is('left_at', null)
            .maybeSingle()

          if (!existing) {
            await admin
              .from('call_participants')
              .insert({ session_id: activeSession.id, user_id: userId })
          }
        }
      }
    }
  } catch (e) {
    console.error('LiveKit webhook handler error:', e)
    // 200 igual para evitar reintentos infinitos de LiveKit por bugs propios
  }

  return NextResponse.json({ ok: true })
}
