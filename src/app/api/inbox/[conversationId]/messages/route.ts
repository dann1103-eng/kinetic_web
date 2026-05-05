import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  dayBoundsLocal,
  dayKeyFromIso,
  DAY_PAGE_CAP,
} from '@/lib/domain/inbox-pagination'
import type { MessageWithMeta, MessageAttachment } from '@/types/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MessageRow = {
  id: string
  conversation_id: string
  user_id: string | null
  body: string
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  author: {
    id: string
    full_name: string
    avatar_url: string | null
  } | null
}

interface DayPageResponse {
  messages: MessageWithMeta[]
  dayKey: string | null
  hasMoreBefore: boolean
}

/**
 * GET /api/inbox/{conversationId}/messages
 *
 * Tres modos:
 * - `?since=ISO` → mensajes con created_at > since, en orden ascendente. Para
 *   incremental tras un evento realtime. Devuelve `MessageWithMeta[]`.
 * - `?beforeDay=YYYY-MM-DD` → carga el último día calendario (zona EL_SAL)
 *   con mensajes ESTRICTAMENTE anterior a esa fecha. Devuelve `DayPageResponse`.
 * - sin params → primer load: último día con mensajes (legacy compat con limit).
 *   Devuelve `MessageWithMeta[]` para compat con clientes antiguos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params
  const since = req.nextUrl.searchParams.get('since')
  const beforeDay = req.nextUrl.searchParams.get('beforeDay')
  const initialDay = req.nextUrl.searchParams.get('initialDay')
  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam ?? '50', 10) || 50, 1), 200)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Modo "initialDay": carga el último día con mensajes (mismo shape que beforeDay).
  if (initialDay) {
    const { data: lastMsgRaw } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastMsgRaw) {
      const empty: DayPageResponse = { messages: [], dayKey: null, hasMoreBefore: false }
      return NextResponse.json(empty)
    }

    const dayKey = dayKeyFromIso(lastMsgRaw.created_at)
    const { startUtcIso, endUtcIso } = dayBoundsLocal(dayKey)

    const { data: msgsRaw, error: msgsErr } = await supabase
      .from('messages')
      .select('id, conversation_id, user_id, body, edited_at, deleted_at, created_at, kind, author:users!messages_user_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .gte('created_at', startUtcIso)
      .lte('created_at', endUtcIso)
      .order('created_at', { ascending: true })
      .limit(DAY_PAGE_CAP)
    if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 })
    const messages = await enrichWithAttachments(supabase, (msgsRaw ?? []) as unknown as MessageRow[])

    const { count: olderCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .lt('created_at', startUtcIso)

    const response: DayPageResponse = {
      messages,
      dayKey,
      hasMoreBefore: (olderCount ?? 0) > 0,
    }
    return NextResponse.json(response)
  }

  // Modo 1: incremental por timestamp
  if (since) {
    const { data: msgsRaw, error: msgsErr } = await supabase
      .from('messages')
      .select('id, conversation_id, user_id, body, edited_at, deleted_at, created_at, kind, author:users!messages_user_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
    if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 })
    const enriched = await enrichWithAttachments(supabase, (msgsRaw ?? []) as unknown as MessageRow[])
    return NextResponse.json(enriched)
  }

  // Modo 2: día anterior a beforeDay
  if (beforeDay) {
    const { startUtcIso: beforeStartIso } = dayBoundsLocal(beforeDay)
    // Encontrar el último mensaje estrictamente antes del inicio de beforeDay.
    const { data: lastBeforeRaw } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .lt('created_at', beforeStartIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastBeforeRaw) {
      const empty: DayPageResponse = { messages: [], dayKey: null, hasMoreBefore: false }
      return NextResponse.json(empty)
    }

    const dayKey = dayKeyFromIso(lastBeforeRaw.created_at)
    const { startUtcIso, endUtcIso } = dayBoundsLocal(dayKey)

    const { data: msgsRaw, error: msgsErr } = await supabase
      .from('messages')
      .select('id, conversation_id, user_id, body, edited_at, deleted_at, created_at, kind, author:users!messages_user_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .gte('created_at', startUtcIso)
      .lte('created_at', endUtcIso)
      .order('created_at', { ascending: true })
      .limit(DAY_PAGE_CAP)
    if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 })
    const messages = await enrichWithAttachments(supabase, (msgsRaw ?? []) as unknown as MessageRow[])

    const { count: olderCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .lt('created_at', startUtcIso)

    const response: DayPageResponse = {
      messages,
      dayKey,
      hasMoreBefore: (olderCount ?? 0) > 0,
    }
    return NextResponse.json(response)
  }

  // Modo 3 (legacy / fallback): últimos N en orden ascendente.
  const { data: msgsRaw, error: msgsErr } = await supabase
    .from('messages')
    .select('id, conversation_id, user_id, body, edited_at, deleted_at, created_at, kind, author:users!messages_user_id_fkey(id, full_name, avatar_url)')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 })
  const ascRows = ((msgsRaw ?? []) as unknown as MessageRow[]).reverse()
  const enriched = await enrichWithAttachments(supabase, ascRows)
  return NextResponse.json(enriched)
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function enrichWithAttachments(
  supabase: SupabaseServerClient,
  msgs: MessageRow[]
): Promise<MessageWithMeta[]> {
  if (msgs.length === 0) return []
  const msgIds = msgs.map((m) => m.id)
  const { data: attsRaw } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', msgIds)
  const attachments = (attsRaw ?? []) as MessageAttachment[]
  const attByMsg = new Map<string, MessageAttachment[]>()
  for (const a of attachments) {
    const list = attByMsg.get(a.message_id) ?? []
    list.push(a)
    attByMsg.set(a.message_id, list)
  }
  return msgs.map((m) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    user_id: m.user_id,
    body: m.body,
    edited_at: m.edited_at,
    deleted_at: m.deleted_at,
    created_at: m.created_at,
    kind: (m as { kind?: 'text' | 'system_missed_call' }).kind ?? 'text',
    author: m.author,
    attachments: attByMsg.get(m.id) ?? [],
  }))
}
