'use client'

import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  AudioConference,
  VideoConference,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { recordCallJoin, endCall } from '@/app/actions/calls'
import type { ActiveCallInfo } from '@/types/db'

interface CallRoomProps {
  call: ActiveCallInfo
  /** Si true, ocupa toda la pantalla. Si false, modo dock minimizable. */
  expanded: boolean
  onLeave: () => void
}

export function CallRoom({ call, expanded, onLeave }: CallRoomProps) {
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
    // Marca al usuario como salido (idempotente con el webhook).
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
      style={
        expanded
          ? { height: '100%', width: '100%' }
          : { height: '100%', width: '100%' }
      }
    >
      {isVoice ? (
        <>
          <RoomAudioRenderer />
          <AudioConference />
        </>
      ) : (
        <VideoConference />
      )}
    </LiveKitRoom>
  )
}
