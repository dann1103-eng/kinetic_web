import { AccessToken, TrackSource } from 'livekit-server-sdk'
import type { CallModality } from '@/types/db'

interface MintTokenInput {
  roomName: string
  identity: string
  name: string
  modality: CallModality
  /** Si true, el usuario puede publicar audio. Default true. */
  canPublish?: boolean
  /** JSON string con datos extra del participante (p.ej. { avatar_url }). */
  metadata?: string
}

/**
 * Firma un JWT de LiveKit con grants apropiados para un participante.
 * El token caduca a las 6h (LiveKit lo refresca con reconexiones internas).
 */
export async function mintLiveKitToken({
  roomName,
  identity,
  name,
  modality,
  canPublish = true,
  metadata,
}: MintTokenInput): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET no configurados')
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: 60 * 60 * 6, // 6h
    metadata,
  })

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
    // canPublishSources opcional — controla qué tracks puede publicar.
    // Para 'voice' restringimos a microphone; para 'video' permitimos cámara
    // y screen share también.
    canPublishSources:
      modality === 'voice'
        ? [TrackSource.MICROPHONE]
        : modality === 'screen'
          ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
          : [
              TrackSource.MICROPHONE,
              TrackSource.CAMERA,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
  })

  return at.toJwt()
}
