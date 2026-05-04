'use client'

import { useCallback, useEffect, useRef } from 'react'
import { PhoneIcon, PhoneOffIcon } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useUserOrNull } from '@/contexts/UserContext'
import { useIncomingCall } from '@/hooks/useIncomingCall'
import { useActiveCallOrNull } from '@/contexts/ActiveCallContext'
import { endCall } from '@/app/actions/calls'

/** Tiempo máximo de timbrado antes de auto-rechazar y terminar la llamada. */
const MAX_RING_MS = 25_000

export function IncomingCallToast() {
  const user = useUserOrNull()
  const { incoming, dismiss } = useIncomingCall(user?.id ?? null)
  const callCtx = useActiveCallOrNull()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const activeCall = callCtx?.activeCall ?? null
  const inAnotherCall = !!(activeCall && incoming && activeCall.sessionId !== incoming.sessionId)

  /** Detiene el ringtone y limpia el timer del timeout. */
  const stopRing = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  /** Auto-rechazo tras MAX_RING_MS: termina la sesión y descarta el toast. */
  const autoReject = useCallback(async () => {
    stopRing()
    if (incoming) {
      await endCall(incoming.sessionId).catch(() => {})
    }
    dismiss()
  }, [incoming, stopRing, dismiss])

  // Si ya estamos en otra llamada distinta cuando llega un nuevo `incoming`,
  // descartamos silenciosamente — sin sonar y sin que se quede colgado en el UI.
  // Esto fixea el bug donde el ringtone seguía sonando en bucle de fondo y no
  // se podía colgar mientras estabas en otra llamada activa.
  useEffect(() => {
    if (incoming && inAnotherCall) {
      stopRing()
      // Cerramos la llamada que entró ya que no la podemos atender — el caller
      // se desconectará vía el listener realtime de call_sessions.
      endCall(incoming.sessionId).catch(() => {})
      dismiss()
    }
  }, [incoming, inAnotherCall, stopRing, dismiss])

  // Reproducir el ringtone MP3 en bucle hasta que el usuario actúe o se cumpla
  // el timeout de MAX_RING_MS.
  useEffect(() => {
    if (!incoming || inAnotherCall) return
    const audio = new Audio('/ringtone.mp3')
    audio.loop = true
    audio.volume = 0.85
    audioRef.current = audio
    audio.play().catch((err) => {
      // Algunos navegadores bloquean autoplay si el usuario no interactuó con
      // la página todavía. No es crítico — el usuario verá el toast igual.
      console.warn('[ringtone] autoplay bloqueado:', err)
    })

    timeoutRef.current = window.setTimeout(autoReject, MAX_RING_MS)

    return () => {
      stopRing()
    }
  }, [incoming, inAnotherCall, autoReject, stopRing])

  if (!incoming || !callCtx || inAnotherCall) return null

  const { startActiveCall } = callCtx

  const modalityLabel =
    incoming.modality === 'video'
      ? 'Videollamada'
      : incoming.modality === 'screen'
        ? 'Compartir pantalla'
        : 'Llamada de voz'

  function handleAccept() {
    if (!incoming) return
    stopRing()
    startActiveCall({
      sessionId: incoming.sessionId,
      conversationId: incoming.conversationId,
      roomName: incoming.roomName,
      modality: incoming.modality,
      title: incoming.fromUser.full_name,
      counterpartAvatarUrl: incoming.fromUser.avatar_url ?? null,
    })
    dismiss()
  }

  function handleReject() {
    stopRing()
    if (incoming) {
      endCall(incoming.sessionId).catch(() => {})
    }
    dismiss()
  }

  return (
    <div className="fixed bottom-6 right-6 z-[300] w-[320px] bg-white border border-[#dfe3e6] rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
      <div className="px-4 py-3 bg-[#00675c]/5 border-b border-[#dfe3e6]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#00675c]">
          {modalityLabel} entrante
        </p>
      </div>
      <div className="px-4 py-4 flex items-center gap-3">
        <UserAvatar
          name={incoming.fromUser.full_name}
          avatarUrl={incoming.fromUser.avatar_url}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#2a2a2a] truncate">
            {incoming.fromUser.full_name}
          </p>
          <p className="text-xs text-[#595c5e]">te está llamando…</p>
        </div>
      </div>
      <div className="px-4 pb-4 flex gap-2">
        <button
          type="button"
          onClick={handleReject}
          className="flex-1 h-10 rounded-lg bg-[#b31b25]/10 text-[#b31b25] hover:bg-[#b31b25]/20 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
        >
          <PhoneOffIcon size={16} />
          Rechazar
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 h-10 rounded-lg bg-[#00675c] text-white hover:bg-[#00675c]/90 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
        >
          <PhoneIcon size={16} />
          Aceptar
        </button>
      </div>
    </div>
  )
}
