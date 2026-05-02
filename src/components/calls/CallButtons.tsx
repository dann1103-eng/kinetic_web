'use client'

import { useState } from 'react'
import { PhoneIcon, VideoIcon, MonitorIcon } from 'lucide-react'
import { startCall, notifyIncomingCall } from '@/app/actions/calls'
import { useActiveCall } from '@/contexts/ActiveCallContext'
import type { CallModality } from '@/types/db'

interface CallButtonsProps {
  conversationId: string
  /** Para mostrar en el dock al iniciar la llamada. */
  title: string
  counterpartAvatarUrl?: string | null
  /** Si true, oculta los botones de video/screen (solo voz). */
  voiceOnly?: boolean
  /** Estilo compacto para la bubble flotante. */
  compact?: boolean
}

export function CallButtons({
  conversationId,
  title,
  counterpartAvatarUrl,
  voiceOnly = false,
  compact = false,
}: CallButtonsProps) {
  const { startActiveCall, activeCall } = useActiveCall()
  const [busy, setBusy] = useState(false)

  const isInThisCall = activeCall?.conversationId === conversationId

  async function handleStart(modality: CallModality) {
    if (busy || isInThisCall) return
    setBusy(true)
    try {
      const result = await startCall({ conversationId, modality })
      if ('error' in result) {
        alert(result.error)
        return
      }

      // Notifica al otro lado del DM (no-op para canales)
      await notifyIncomingCall({
        conversationId,
        sessionId: result.sessionId,
        modality,
      })

      startActiveCall({
        sessionId: result.sessionId,
        conversationId,
        roomName: result.roomName,
        modality,
        title,
        counterpartAvatarUrl,
      })
    } finally {
      setBusy(false)
    }
  }

  const sz = compact ? 'w-7 h-7' : 'w-9 h-9'
  const iconSz = compact ? 14 : 16

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleStart('voice')}
        disabled={busy || isInThisCall}
        title={isInThisCall ? 'Ya estás en esta llamada' : 'Llamada de voz'}
        className={`${sz} rounded-full bg-[#00675c]/10 text-[#00675c] hover:bg-[#00675c]/20 flex items-center justify-center transition-colors disabled:opacity-50`}
      >
        <PhoneIcon size={iconSz} />
      </button>
      {!voiceOnly && (
        <>
          <button
            type="button"
            onClick={() => handleStart('video')}
            disabled={busy || isInThisCall}
            title="Videollamada"
            className={`${sz} rounded-full bg-[#00675c]/10 text-[#00675c] hover:bg-[#00675c]/20 flex items-center justify-center transition-colors disabled:opacity-50`}
          >
            <VideoIcon size={iconSz} />
          </button>
          <button
            type="button"
            onClick={() => handleStart('screen')}
            disabled={busy || isInThisCall}
            title="Compartir pantalla"
            className={`${sz} rounded-full bg-[#00675c]/10 text-[#00675c] hover:bg-[#00675c]/20 flex items-center justify-center transition-colors disabled:opacity-50`}
          >
            <MonitorIcon size={iconSz} />
          </button>
        </>
      )}
    </div>
  )
}
