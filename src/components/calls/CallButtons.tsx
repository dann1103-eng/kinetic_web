'use client'

import { useState } from 'react'
import { PhoneIcon, VideoIcon, MonitorIcon } from 'lucide-react'
import { startCall, notifyIncomingCall } from '@/app/actions/calls'
import { useActiveCallOrNull } from '@/contexts/ActiveCallContext'
import type { CallModality } from '@/types/db'

type Variant = 'light' | 'dark'

interface CallButtonsProps {
  conversationId: string
  /** Para mostrar en el dock al iniciar la llamada. */
  title: string
  counterpartAvatarUrl?: string | null
  /** Si true, oculta los botones de video/screen (solo voz). */
  voiceOnly?: boolean
  /** Estilo compacto para la bubble flotante. */
  compact?: boolean
  /**
   * 'light' (default) — para fondos claros: teal sobre teal/10.
   * 'dark' — para fondos oscuros (header del bubble): blanco sobre blanco/15.
   */
  variant?: Variant
}

const STYLES: Record<Variant, string> = {
  light: 'bg-[#00675c]/10 text-[#00675c] hover:bg-[#00675c]/20',
  dark: 'bg-white/15 text-white hover:bg-white/25',
}

export function CallButtons({
  conversationId,
  title,
  counterpartAvatarUrl,
  voiceOnly = false,
  compact = false,
  variant = 'light',
}: CallButtonsProps) {
  // useActiveCallOrNull para no crashear si por alguna razón el provider no
  // está disponible — preferimos no renderizar los botones a romper el header.
  const ctx = useActiveCallOrNull()
  const [busy, setBusy] = useState(false)

  if (!ctx) return null

  const { startActiveCall, activeCall } = ctx
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
  const colorCls = STYLES[variant]

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleStart('voice')}
        disabled={busy || isInThisCall}
        title={isInThisCall ? 'Ya estás en esta llamada' : 'Llamada de voz'}
        className={`${sz} rounded-full ${colorCls} flex items-center justify-center transition-colors disabled:opacity-50`}
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
            className={`${sz} rounded-full ${colorCls} flex items-center justify-center transition-colors disabled:opacity-50`}
          >
            <VideoIcon size={iconSz} />
          </button>
          <button
            type="button"
            onClick={() => handleStart('screen')}
            disabled={busy || isInThisCall}
            title="Compartir pantalla"
            className={`${sz} rounded-full ${colorCls} flex items-center justify-center transition-colors disabled:opacity-50`}
          >
            <MonitorIcon size={iconSz} />
          </button>
        </>
      )}
    </div>
  )
}
