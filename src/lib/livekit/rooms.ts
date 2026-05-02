/**
 * Convención de nombres de room en LiveKit.
 * Una conversación → un room. Permite tener una sola llamada activa por
 * conversación (DM o canal) y reusar el mismo room cuando alguien se une después.
 */
export function roomNameForConversation(conversationId: string): string {
  return `conv-${conversationId}`
}

export function conversationIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith('conv-')) return null
  return roomName.slice('conv-'.length)
}
