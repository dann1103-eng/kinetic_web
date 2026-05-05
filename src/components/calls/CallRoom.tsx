'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useParticipants,
  useDataChannel,
  useRoomContext,
  VideoTrack,
  ControlBar,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { Participant } from 'livekit-client'
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react'
import '@livekit/components-styles'
import { recordCallJoin, leaveCall } from '@/app/actions/calls'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { cn } from '@/lib/utils'
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

// ── CallStateContext: hand raise + reactions vía LiveKit data channel ─────

interface Reaction {
  id: string
  emoji: string
  participantId: string
}

interface CallStateContextValue {
  handsRaised: Set<string>
  myHandRaised: boolean
  toggleHandRaise: () => void
  reactions: Reaction[]
  sendReaction: (emoji: string) => void
}

const CallStateContext = createContext<CallStateContextValue | null>(null)

function useCallState(): CallStateContextValue {
  const ctx = useContext(CallStateContext)
  if (!ctx) throw new Error('useCallState debe usarse dentro de CallStateProvider')
  return ctx
}

const CALL_STATE_TOPIC = 'fm-call-state'
const REACTION_LIFETIME_MS = 4000

function CallStateProvider({ children }: { children: ReactNode }) {
  const room = useRoomContext()
  const localId = room.localParticipant.identity
  const [handsRaised, setHandsRaised] = useState<Set<string>>(new Set())
  const [reactions, setReactions] = useState<Reaction[]>([])
  const reactionTimers = useRef<Map<string, number>>(new Map())

  const removeReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id))
    const t = reactionTimers.current.get(id)
    if (t !== undefined) {
      window.clearTimeout(t)
      reactionTimers.current.delete(id)
    }
  }, [])

  const addReaction = useCallback(
    (participantId: string, emoji: string) => {
      const id = `${participantId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const reaction: Reaction = { id, emoji, participantId }
      setReactions((prev) => [...prev, reaction])
      const timer = window.setTimeout(() => removeReaction(id), REACTION_LIFETIME_MS)
      reactionTimers.current.set(id, timer)
    },
    [removeReaction]
  )

  // Cleanup timers al desmontar
  useEffect(() => {
    const timers = reactionTimers.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
    }
  }, [])

  const { send } = useDataChannel(CALL_STATE_TOPIC, (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        type: 'hand_raise' | 'reaction'
        raised?: boolean
        emoji?: string
      }
      const fromId = msg.from?.identity
      if (!fromId) return

      if (data.type === 'hand_raise') {
        setHandsRaised((prev) => {
          const next = new Set(prev)
          if (data.raised) next.add(fromId)
          else next.delete(fromId)
          return next
        })
      } else if (data.type === 'reaction' && typeof data.emoji === 'string') {
        addReaction(fromId, data.emoji)
      }
    } catch {
      // ignore mal formados
    }
  })

  const toggleHandRaise = useCallback(() => {
    setHandsRaised((prev) => {
      const isUp = prev.has(localId)
      const next = new Set(prev)
      if (isUp) next.delete(localId)
      else next.add(localId)
      const payload = JSON.stringify({ type: 'hand_raise', raised: !isUp })
      send(new TextEncoder().encode(payload), { reliable: true, topic: CALL_STATE_TOPIC })
      return next
    })
  }, [localId, send])

  const sendReaction = useCallback(
    (emoji: string) => {
      addReaction(localId, emoji)
      const payload = JSON.stringify({ type: 'reaction', emoji })
      send(new TextEncoder().encode(payload), { reliable: true, topic: CALL_STATE_TOPIC })
    },
    [localId, addReaction, send]
  )

  const myHandRaised = handsRaised.has(localId)

  const value = useMemo<CallStateContextValue>(
    () => ({ handsRaised, myHandRaised, toggleHandRaise, reactions, sendReaction }),
    [handsRaised, myHandRaised, toggleHandRaise, reactions, sendReaction]
  )

  return <CallStateContext.Provider value={value}>{children}</CallStateContext.Provider>
}

// ── Watcher de screen share ───────────────────────────────────────────────

function ScreenShareWatcher({ onChange }: { onChange?: (active: boolean) => void }) {
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false })
  const isActive = tracks.length > 0

  useEffect(() => {
    onChange?.(isActive)
  }, [isActive, onChange])

  return null
}

// ── Tiles: cada participante muestra mano levantada + reacciones flotantes

function ReactionsOverlay({ participantId }: { participantId: string }) {
  const { reactions } = useCallState()
  const mine = reactions.filter((r) => r.participantId === participantId)
  if (mine.length === 0) return null
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {mine.map((r) => (
        <div
          key={r.id}
          className="absolute left-1/2 bottom-3 text-4xl animate-fm-float-up select-none"
        >
          {r.emoji}
        </div>
      ))}
    </div>
  )
}

function HandRaiseBadge({ participantId, size = 'md' }: { participantId: string; size?: 'sm' | 'md' }) {
  const { handsRaised } = useCallState()
  if (!handsRaised.has(participantId)) return null
  const sz = size === 'sm' ? 'w-6 h-6 text-sm' : 'w-8 h-8 text-lg'
  return (
    <div
      className={cn(
        'absolute top-2 left-2 rounded-full bg-amber-500/95 flex items-center justify-center shadow-lg ring-2 ring-black/20',
        sz
      )}
      title="Mano levantada"
      aria-label="Mano levantada"
    >
      ✋
    </div>
  )
}

function VoiceParticipantTile({ participant }: { participant: Participant }) {
  return (
    <div className="relative flex flex-col items-center gap-3">
      <div className="relative">
        <div className="ring-2 ring-white/10 rounded-full">
          <UserAvatar
            name={participant.name ?? participant.identity}
            avatarUrl={safeParseAvatar(participant.metadata)}
            size="lg"
          />
        </div>
        <HandRaiseBadge participantId={participant.identity} size="sm" />
        <ReactionsOverlay participantId={participant.identity} />
      </div>
      <span className="text-white/80 text-xs font-medium text-center max-w-[120px] truncate">
        {participant.name ?? participant.identity}
      </span>
    </div>
  )
}

function VoiceCallLayout() {
  const participants = useParticipants()
  return (
    <div className="flex-1 flex flex-wrap justify-center items-center gap-6 p-8 overflow-auto min-h-0 content-center">
      {participants.length === 0 && (
        <p className="text-white/50 text-sm">Conectando…</p>
      )}
      {participants.map((p) => (
        <VoiceParticipantTile key={p.identity} participant={p} />
      ))}
    </div>
  )
}

function VideoParticipantTile({
  participant,
  cameraTrack,
  hasCameraOn,
  compact,
}: {
  participant: Participant
  cameraTrack: TrackReferenceOrPlaceholder | undefined
  hasCameraOn: boolean
  compact: boolean
}) {
  const room = useRoomContext()
  const isLocal = participant.identity === room.localParticipant.identity

  return (
    <div
      className={cn(
        'relative aspect-video rounded-xl overflow-hidden bg-[#1a1a1a] flex items-center justify-center flex-shrink-0',
        compact
          ? 'h-full max-w-[280px] min-w-[180px]'
          : 'flex-1 basis-[320px] min-w-[280px] max-w-full max-h-full'
      )}
    >
      {hasCameraOn && cameraTrack ? (
        <VideoTrack
          trackRef={cameraTrack as TrackReference}
          className={cn(
            'w-full h-full object-cover',
            // Solo la cámara local se muestra en espejo (efecto selfie estándar).
            // Las cámaras remotas se ven al derecho como están grabando.
            isLocal && '-scale-x-100'
          )}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-4">
          <UserAvatar
            name={participant.name ?? participant.identity}
            avatarUrl={safeParseAvatar(participant.metadata)}
            size="lg"
          />
          <span className="text-white/70 text-xs font-medium text-center truncate max-w-full">
            {participant.name ?? participant.identity}
          </span>
        </div>
      )}
      {/* Etiqueta con nombre cuando hay cámara */}
      {hasCameraOn && (
        <span className="absolute bottom-2 right-2 text-white/85 text-[10px] bg-black/60 px-2 py-0.5 rounded-full">
          {participant.name ?? participant.identity}
        </span>
      )}
      <HandRaiseBadge participantId={participant.identity} size="md" />
      <ReactionsOverlay participantId={participant.identity} />
    </div>
  )
}

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

  const cameraByIdentity = new Map<string, TrackReferenceOrPlaceholder>()
  for (const t of cameraTracks) {
    cameraByIdentity.set(t.participant.identity, t)
  }

  const hasScreen = screenTracks.length > 0

  return (
    <div className="flex-1 flex flex-col gap-2 p-2 overflow-hidden min-h-0">
      {hasScreen && (
        // items-stretch (default) + sin aspect-video en el tile permite que la
        // pantalla compartida llene toda el área vertical/horizontal disponible.
        // El object-contain en el VideoTrack mantiene la proporción real del
        // video (con letterbox si la pantalla del emisor no es 16:9).
        <div className="flex-1 min-h-0 flex gap-2 items-stretch">
          {screenTracks.map((t) => (
            <div
              key={`${t.participant.identity}-screen`}
              className="relative flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden bg-[#111]"
            >
              <VideoTrack
                trackRef={t as TrackReference}
                className="w-full h-full object-contain"
              />
              <span className="absolute bottom-2 left-2 text-white/85 text-[10px] bg-black/60 px-2 py-0.5 rounded-full">
                {t.participant.name ?? t.participant.identity} · pantalla
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex gap-2 justify-center items-stretch min-h-0',
          hasScreen
            ? 'h-[140px] flex-shrink-0 overflow-x-auto'
            : 'flex-1 flex-wrap content-center items-center overflow-auto'
        )}
      >
        {participants.map((p) => {
          const cameraTrack = cameraByIdentity.get(p.identity)
          const hasCameraOn =
            cameraTrack !== undefined &&
            'publication' in cameraTrack &&
            !(cameraTrack as TrackReference).publication?.isMuted

          return (
            <VideoParticipantTile
              key={p.identity}
              participant={p}
              cameraTrack={cameraTrack}
              hasCameraOn={hasCameraOn}
              compact={hasScreen}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Custom controls: levantar mano + reaccionar ───────────────────────────

const REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '🎉', '👏', '🙌', '😮', '🔥', '💯']

function CustomCallControls() {
  const { myHandRaised, toggleHandRaise, sendReaction } = useCallState()
  const [emojiOpen, setEmojiOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleHandRaise}
        title={myHandRaised ? 'Bajar la mano' : 'Levantar la mano'}
        className={cn(
          'h-9 px-3 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5',
          myHandRaised
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-white/10 text-white hover:bg-white/20'
        )}
      >
        <span className="text-base leading-none">✋</span>
        <span>{myHandRaised ? 'Bajar' : 'Mano'}</span>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          title="Reaccionar"
          className="h-9 px-3 rounded-full text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors flex items-center gap-1.5"
        >
          <span className="text-base leading-none">😊</span>
          <span>Reaccionar</span>
        </button>
        {emojiOpen && (
          <>
            <div
              className="fixed inset-0 z-[220]"
              onClick={() => setEmojiOpen(false)}
            />
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[221] bg-[#1a1a1a] border border-white/10 rounded-2xl p-2 flex gap-1 shadow-2xl">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    sendReaction(emoji)
                    setEmojiOpen(false)
                  }}
                  className="text-2xl p-1.5 hover:bg-white/10 rounded-lg transition-colors leading-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────

export function CallRoom({ call, onLeave, onScreenShareChange }: CallRoomProps) {
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
    // Solo marca left_at para el usuario actual — no cierra la sesión para todos.
    // endCall() (que pone ended_at) solo se llama desde handleHangup en CallDock.
    await leaveCall(call.sessionId).catch(() => {})
    onLeave()
  }

  async function handleConnected() {
    await recordCallJoin(call.sessionId).catch(() => {})
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-[#b31b25]">
        Error de llamada: {error}
        <button type="button" onClick={onLeave} className="ml-2 underline">
          Cerrar
        </button>
      </div>
    )
  }

  if (!token || !serverUrl) {
    return <div className="p-4 text-xs text-[#595c5e]">Conectando…</div>
  }

  const isVoice = call.modality === 'voice'
  const startWithVideo = call.modality === 'video'
  // Solo el iniciador auto-publica su pantalla. Los receptores se conectan
  // a recibir el track del iniciador, no a compartir su propia pantalla.
  const startWithScreen = call.modality === 'screen' && call.isInitiator

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
      <CallStateProvider>
        <div className="flex flex-col h-full w-full bg-[#0e0e0e]">
          {isVoice ? <VoiceCallLayout /> : <VideoCallLayout />}
          <div className="flex flex-col">
            <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-white/5 bg-black/40">
              <CustomCallControls />
            </div>
            <ControlBar
              controls={
                isVoice
                  ? {
                      camera: false,
                      screenShare: false,
                      microphone: true,
                      leave: true,
                      settings: false,
                      chat: false,
                    }
                  : {
                      camera: true,
                      screenShare: !isVoice,
                      microphone: true,
                      leave: true,
                      settings: false,
                      chat: false,
                    }
              }
            />
          </div>
        </div>
      </CallStateProvider>
    </LiveKitRoom>
  )
}
