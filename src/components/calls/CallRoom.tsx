'use client'

import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useParticipants,
  VideoTrack,
  ControlBar,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react'
import '@livekit/components-styles'
import { recordCallJoin, endCall } from '@/app/actions/calls'
import { UserAvatar } from '@/components/ui/UserAvatar'
import type { ActiveCallInfo } from '@/types/db'

interface CallRoomProps {
  call: ActiveCallInfo
  /** Si true, ocupa toda la pantalla. Si false, modo dock minimizable. */
  expanded: boolean
  onLeave: () => void
  /**
   * Callback que dispara cada vez que cambia el estado de "alguien comparte
   * pantalla" en la sala. El dock lo usa para auto-pasar a fullscreen.
   */
  onScreenShareChange?: (active: boolean) => void
}

function safeParseAvatar(metadata?: string): string | null {
  try {
    const m = JSON.parse(metadata ?? '{}')
    return typeof m.avatar_url === 'string' && m.avatar_url ? m.avatar_url : null
  } catch {
    return null
  }
}

/**
 * Componente interno que vive dentro del LiveKitRoom y observa los tracks
 * de screen share para notificar al dock. Sin esto no podemos auto-fullscreen
 * porque los hooks de LiveKit solo funcionan dentro del Room context.
 */
function ScreenShareWatcher({ onChange }: { onChange?: (active: boolean) => void }) {
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false })
  const isActive = tracks.length > 0

  useEffect(() => {
    onChange?.(isActive)
  }, [isActive, onChange])

  return null
}

/**
 * Layout para llamadas de voz: muestra la foto de perfil de cada participante.
 * Como no hay video, construimos el grid directamente con useParticipants().
 */
function VoiceCallLayout() {
  const participants = useParticipants()

  return (
    <div className="flex-1 flex flex-wrap justify-center items-center gap-6 p-8 overflow-auto min-h-0">
      {participants.length === 0 && (
        <p className="text-white/50 text-sm">Conectando…</p>
      )}
      {participants.map((p) => (
        <div key={p.identity} className="flex flex-col items-center gap-3">
          <div className="ring-2 ring-white/10 rounded-full">
            <UserAvatar
              name={p.name ?? p.identity}
              avatarUrl={safeParseAvatar(p.metadata)}
              size="lg"
            />
          </div>
          <span className="text-white/80 text-xs font-medium text-center max-w-[120px] truncate">
            {p.name ?? p.identity}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Layout para videollamadas y pantalla compartida.
 * – Si la cámara está activa: muestra el track de video.
 * – Si la cámara está apagada: muestra la foto de perfil.
 * – Pantallas compartidas se muestran con su propio tile grande.
 */
function VideoCallLayout() {
  const participants = useParticipants()

  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  )
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  )

  // Mapa identity → track de cámara activo
  const cameraByIdentity = new Map<string, TrackReferenceOrPlaceholder>()
  for (const t of cameraTracks) {
    cameraByIdentity.set(t.participant.identity, t)
  }

  return (
    <div className="flex-1 flex flex-wrap justify-center items-center gap-4 p-4 overflow-auto min-h-0">
      {/* Pantallas compartidas */}
      {screenTracks.map((t) => (
        <div
          key={`${t.participant.identity}-screen`}
          className="relative w-[480px] max-w-full aspect-video rounded-xl overflow-hidden bg-[#111] flex-shrink-0"
        >
          <VideoTrack
            trackRef={t as TrackReference}
            className="w-full h-full object-contain"
          />
          <span className="absolute bottom-2 left-2 text-white/80 text-[10px] bg-black/60 px-2 py-0.5 rounded-full">
            {t.participant.name ?? t.participant.identity} · pantalla
          </span>
        </div>
      ))}

      {/* Tiles de participantes (cámara o avatar) */}
      {participants.map((p) => {
        const cameraTrack = cameraByIdentity.get(p.identity)
        const hasCameraOn =
          cameraTrack !== undefined &&
          'publication' in cameraTrack &&
          !(cameraTrack as TrackReference).publication?.isMuted

        return (
          <div
            key={p.identity}
            className="w-[220px] max-w-full aspect-video rounded-xl overflow-hidden bg-[#1a1a1a] flex items-center justify-center flex-shrink-0"
          >
            {hasCameraOn ? (
              <VideoTrack
                trackRef={cameraTrack as TrackReference}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-4">
                <UserAvatar
                  name={p.name ?? p.identity}
                  avatarUrl={safeParseAvatar(p.metadata)}
                  size="lg"
                />
                <span className="text-white/70 text-xs font-medium text-center truncate max-w-full">
                  {p.name ?? p.identity}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function CallRoom({ call, expanded, onLeave, onScreenShareChange }: CallRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchToken() {
      try {
        const res = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: call.conversationId,
            modality: call.modality,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Token endpoint ${res.status}`)
        }
        const json = (await res.json()) as { token: string; url: string }
        if (!cancelled) {
          setToken(json.token)
          setServerUrl(json.url)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo obtener token')
        }
      }
    }
    fetchToken()
    return () => {
      cancelled = true
    }
  }, [call.conversationId, call.modality])

  async function handleDisconnected() {
    await endCall(call.sessionId).catch(() => {})
    onLeave()
  }

  async function handleConnected() {
    await recordCallJoin(call.sessionId).catch(() => {})
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-[#b31b25]">
        Error de llamada: {error}
        <button
          type="button"
          onClick={onLeave}
          className="ml-2 underline"
        >
          Cerrar
        </button>
      </div>
    )
  }

  if (!token || !serverUrl) {
    return (
      <div className="p-4 text-xs text-[#595c5e]">Conectando…</div>
    )
  }

  const isVoice = call.modality === 'voice'
  const startWithVideo = call.modality === 'video'
  const startWithScreen = call.modality === 'screen'

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={startWithVideo}
      screen={startWithScreen}
      onDisconnected={handleDisconnected}
      onConnected={handleConnected}
      data-lk-theme="default"
      style={{ height: '100%', width: '100%' }}
    >
      <ScreenShareWatcher onChange={onScreenShareChange} />
      <RoomAudioRenderer />
      <div className="flex flex-col h-full w-full bg-[#0e0e0e]">
        {isVoice ? <VoiceCallLayout /> : <VideoCallLayout />}
        <ControlBar
          controls={
            isVoice
              ? { camera: false, screenShare: false, microphone: true, leave: true, settings: false }
              : { camera: true, screenShare: !isVoice, microphone: true, leave: true, settings: false }
          }
        />
      </div>
    </LiveKitRoom>
  )
}
