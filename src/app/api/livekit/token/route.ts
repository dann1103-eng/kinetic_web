import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mintLiveKitToken } from '@/lib/livekit/token'
import { roomNameForConversation } from '@/lib/livekit/rooms'
import type { CallModality } from '@/types/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TokenBody {
  conversationId: string
  modality?: CallModality
}

export async function POST(req: Request) {
  let body: TokenBody
  try {
    body = (await req.json()) as TokenBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const conversationId = body.conversationId
  const modality: CallModality = body.modality ?? 'voice'
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId requerido' }, { status: 400 })
  }
  if (!['voice', 'video', 'screen'].includes(modality)) {
    return NextResponse.json({ error: 'modality inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verifica que el user es miembro de la conversación (RLS también lo hace,
  // pero queremos un 403 limpio en vez de un join vacío).
  const { data: membership } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json(
      { error: 'No eres miembro de esta conversación' },
      { status: 403 }
    )
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('id', user.id)
    .single()

  const roomName = roomNameForConversation(conversationId)
  const token = await mintLiveKitToken({
    roomName,
    identity: user.id,
    name: appUser?.full_name ?? 'Usuario',
    modality,
  })

  return NextResponse.json({
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    roomName,
  })
}
