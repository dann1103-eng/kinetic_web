import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { ConversationView } from '@/components/inbox/ConversationView'
import { dayBoundsLocal, dayKeyFromIso, DAY_PAGE_CAP } from '@/lib/domain/inbox-pagination'
import type {
  AppUser,
  Conversation,
  MessageAttachment,
  MessageWithMeta,
} from '@/types/db'

interface PageProps {
  params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params

  const ctx = await getEffectiveUser()
  if (!ctx) notFound()
  const effectiveUserId = ctx.appUser.id
  const isAdmin = ctx.appUser.role === 'admin'
  // Cuando se está suplantando, las RLS bloquearían las queries del admin
  // (no es miembro) → bypass con admin client.
  let supabase = ctx.isImpersonating ? createAdminClient() : await createClient()

  let convRaw: Conversation | null = null
  {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle()
    convRaw = data as Conversation | null
  }

  // Política: admins pueden abrir cualquier CANAL aunque no sean miembros
  // (DMs siguen privados). Si la query con RLS no devolvió nada y el user es
  // admin, retry con admin client y validamos que sea un canal — si es DM
  // ajeno, 404.
  if (!convRaw && isAdmin && !ctx.isImpersonating) {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle()
    if (data && (data.type === 'channel' || data.type === 'voice_channel')) {
      convRaw = data as Conversation
      supabase = adminClient // resto de queries del admin usan admin client
    }
  }

  if (!convRaw) notFound()
  const conversation = convRaw

  // Miembros
  type MemberRow = {
    user_id: string
    user: { id: string; full_name: string; avatar_url: string | null; role: AppUser['role'] } | null
  }
  const { data: membersRaw } = await supabase
    .from('conversation_members')
    .select('user_id, user:users!conversation_members_user_id_fkey(id, full_name, avatar_url, role)')
    .eq('conversation_id', conversationId)
  const members = ((membersRaw ?? []) as unknown as MemberRow[])
    .map((m) => m.user)
    .filter((u): u is NonNullable<MemberRow['user']> => u !== null)

  // Paginación por día — cargar solo el último día con mensajes (cap DAY_PAGE_CAP).
  // Para una conversación con miles de mensajes, esto evita traer todo el historial
  // en cada open. La UI ofrece un botón "Cargar día anterior" para pedir más.
  type MessageRow = {
    id: string
    conversation_id: string
    user_id: string | null
    body: string
    edited_at: string | null
    deleted_at: string | null
    created_at: string
    author: { id: string; full_name: string; avatar_url: string | null } | null
  }

  // 1) Encontrar el timestamp del último mensaje (si existe).
  const { data: lastMsgRaw } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let initialDayKey: string | null = null
  let msgsAsc: MessageRow[] = []
  let hasMoreBefore = false

  if (lastMsgRaw) {
    initialDayKey = dayKeyFromIso(lastMsgRaw.created_at)
    const { startUtcIso, endUtcIso } = dayBoundsLocal(initialDayKey)

    // 2) Cargar todos los mensajes de ese día (cap por seguridad).
    const { data: dayMsgsRaw } = await supabase
      .from('messages')
      .select('id, conversation_id, user_id, body, edited_at, deleted_at, created_at, kind, author:users!messages_user_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .gte('created_at', startUtcIso)
      .lte('created_at', endUtcIso)
      .order('created_at', { ascending: true })
      .limit(DAY_PAGE_CAP)
    msgsAsc = (dayMsgsRaw ?? []) as unknown as MessageRow[]

    // 3) ¿Hay mensajes anteriores al inicio de este día?
    const { count: olderCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .lt('created_at', startUtcIso)
    hasMoreBefore = (olderCount ?? 0) > 0
  }

  const msgIds = msgsAsc.map((m) => m.id)
  const { data: attsRaw } = msgIds.length > 0
    ? await supabase
        .from('message_attachments')
        .select('*')
        .in('message_id', msgIds)
    : { data: [] as MessageAttachment[] }
  const atts = (attsRaw ?? []) as MessageAttachment[]
  const attByMsg = new Map<string, MessageAttachment[]>()
  for (const a of atts) {
    const list = attByMsg.get(a.message_id) ?? []
    list.push(a)
    attByMsg.set(a.message_id, list)
  }

  const initialMessages: MessageWithMeta[] = msgsAsc.map((m) => ({
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

  // Para el panel de detalles del canal: adjuntos compartidos en el canal (solo canales)
  let channelAttachments: MessageAttachment[] = []
  if (conversation.type === 'channel') {
    const { data: allMsgsRaw } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
    const allMsgIds = ((allMsgsRaw ?? []) as Array<{ id: string }>).map((x) => x.id)
    if (allMsgIds.length > 0) {
      const { data: allAttsRaw } = await supabase
        .from('message_attachments')
        .select('*')
        .in('message_id', allMsgIds)
        .order('created_at', { ascending: false })
        .limit(50)
      channelAttachments = (allAttsRaw ?? []) as MessageAttachment[]
    }
  }

  // Lista de todos los usuarios (para "Agregar miembros" en canales)
  let allUsers: Pick<AppUser, 'id' | 'full_name' | 'avatar_url' | 'role'>[] = []
  if (conversation.type === 'channel' && isAdmin) {
    const { data: allUsersRaw } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, role')
      .order('full_name', { ascending: true })
    allUsers = (allUsersRaw ?? []) as Pick<AppUser, 'id' | 'full_name' | 'avatar_url' | 'role'>[]
  }

  return (
    <ConversationView
      conversation={conversation}
      members={members}
      allUsers={allUsers}
      initialMessages={initialMessages}
      initialDayKey={initialDayKey}
      initialHasMoreBefore={hasMoreBefore}
      channelAttachments={channelAttachments}
      currentUserId={effectiveUserId}
      isAdmin={isAdmin}
    />
  )
}
