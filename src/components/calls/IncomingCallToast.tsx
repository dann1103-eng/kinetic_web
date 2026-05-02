'use client'

import { useEffect, useRef } from 'react'
import { PhoneIcon, PhoneOffIcon } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useUserOrNull } from '@/contexts/UserContext'
import { useIncomingCall } from '@/hooks/useIncomingCall'
import { useActiveCall } from '@/contexts/ActiveCallContext'

const RING_LOOP_MS = 1100

export function IncomingCallToast() {
  const user = useUserOrNull()
  const { incoming, dismiss } = useIncomingCall(user?.id ?? null)
  const { activeCall, startActiveCall } = useActiveCall()
  const ringTimerRef = useRef<number | null>(null)

  // Reproducir un beep simple sintetizado en bucle (evita dependencia de archivo).
  useEffect(() => {
    if (!incoming) return
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const playBeep = () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 660
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.65)
    }

    playBeep()
    ringTimerRef.current = window.setInterval(playBeep, RING_LOOP_MS)

    return () => {
      if (ringTimerRef.current !== null) {
        window.clearInterval(ringTimerRef.current)
        ringTimerRef.current = null
      }
      ctx.close().catch(() => {})
    }
  }, [incoming])

  if (!incoming) return null

  // Si ya estamos en otra llamada distinta, no mostramos el toast (la nueva
  // queda perdida — Fase futura: notificación silenciosa).
  if (activeCall && activeCall.sessionId !== incoming.sessionId) return null

  const modalityLabel =
    incoming.modality === 'video'
      ? 'Videollamada'
      : incoming.modality === 'screen'
        ? 'Compartir pantalla'
        : 'Llamada de voz'

  function handleAccept() {
    if (!incoming) return
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
          onClick={dismiss}
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
