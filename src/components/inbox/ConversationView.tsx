'use client'

import { useCallback, useState } from 'react'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { MessageComposer } from './MessageComposer'
import { ChannelDetailsPanel } from './ChannelDetailsPanel'
import type {
  Conversation,
  MessageWithMeta,
  AppUser,
  MessageAttachment,
} from '@/types/db'

interface ConversationViewProps {
  conversation: Conversation
  members: Pick<AppUser, 'id' | 'full_name' | 'avatar_url' | 'role'>[]
  allUsers: Pick<AppUser, 'id' | 'full_name' | 'avatar_url' | 'role'>[]
  initialMessages: MessageWithMeta[]
  initialDayKey: string | null
  initialHasMoreBefore: boolean
  channelAttachments: MessageAttachment[]
  currentUserId: string
  isAdmin: boolean
}

export function ConversationView({
  conversation,
  members,
  allUsers,
  initialMessages,
  initialDayKey,
  initialHasMoreBefore,
  channelAttachments,
  currentUserId,
  isAdmin,
}: ConversationViewProps) {
  const [detailsOpen, setDetailsOpen] = useState(conversation.type === 'channel')
  const [replyTo, setReplyTo] = useState<{ id: string; body: string; authorName: string } | null>(null)

  const handleReply = useCallback((msg: MessageWithMeta) => {
    setReplyTo({
      id: msg.id,
      body: msg.body,
      authorName: msg.author?.full_name ?? 'Usuario',
    })
  }, [])

  const counterpart =
    conversation.type === 'dm'
      ? members.find((m) => m.id !== currentUserId) ?? null
      : null

  const composerPlaceholder =
    conversation.type === 'channel'
      ? `Escribe un mensaje a #${conversation.name}...`
      : `Escribe un mensaje a ${counterpart?.full_name ?? ''}...`

  return (
    <>
      <main className="flex-1 flex flex-col bg-fm-surface-container-lowest min-w-0">
        <ChatHeader
          conversation={conversation}
          counterpart={counterpart}
          memberCount={members.length}
          showDetailsButton={conversation.type === 'channel'}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((v) => !v)}
        />
        <MessageList
          conversationId={conversation.id}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          initialMessages={initialMessages}
          initialDayKey={initialDayKey}
          initialHasMoreBefore={initialHasMoreBefore}
          onReply={handleReply}
        />
        <MessageComposer
          conversationId={conversation.id}
          placeholder={composerPlaceholder}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
        />
      </main>
      {conversation.type === 'channel' && detailsOpen && (
        <ChannelDetailsPanel
          conversation={conversation}
          members={members}
          allUsers={allUsers}
          attachments={channelAttachments}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  )
}
