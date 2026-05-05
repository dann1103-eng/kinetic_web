'use client'

import { useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  Minimize2Icon,
  Maximize2Icon,
  PhoneOffIcon,
  ExpandIcon,
  ShrinkIcon,
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useActiveCallOrNull } from '@/contexts/ActiveCallContext'
import { endCall, leaveCall } from '@/app/actions/calls'
import { cn } from '@/lib/utils'

// CallRoom incluye el SDK pesado de LiveKit (~150KB gz). Se carga solo
// cuando hay una llamada activa, para no inflar el bundle del CRM normal.
const CallRoom = dynamic(
  () => import('./CallRoom').then((m) => m.CallRoom),
  {
    ssr: false,
    loading: () => <div className="p-4 text-xs text-[#595c5e]">Cargando llamada…</div>,
  }
)

export function CallDock() {
  const ctx = useActiveCallOrNull()
  // El callback de screen share viene antes de los early returns para que el
  // orden de hooks sea estable cuando el dock aparece/desaparece.
  const autoFullscreenedRef = useRef(false)
  // Cuando el usuario minimiza manualmente, no forzamos fullscreen aunque
  // haya un screen share activo — respetamos la decisión del usuario.
  const userMinimizedRef = useRef(false)

  const setFullscreen = ctx?.setFullscreen
  const handleScreenShareChange = useCallback(
    (active: boolean) => {
      if (!setFullscreen) return
      if (active && !autoFullscreenedRef.current && !userMinimizedRef.current) {
        autoFullscreenedRef.current = true
        setFullscreen(true)
      }
      if (!active) {
        autoFullscreenedRef.current = false
        // No resetear userMinimizedRef — si el user minimizó, lo respetamos
        // incluso para el próximo screen share de esa sesión.
      }
    },
    [setFullscreen]
  )

  // Al cambiar de sesión (nueva llamada), reseteamos los refs para que la
  // siguiente llamada arranque limpia: auto-fullscreen funciona y la decisión
  // anterior de minimizar no se hereda.
  useEffect(() => {
    autoFullscreenedRef.current = false
    userMinimizedRef.current = false
    if (ctx?.activeCall?.modality === 'screen') {
      ctx.setFullscreen(true)
      autoFullscreenedRef.current = true
    }
  }, [ctx?.activeCall?.sessionId, ctx?.activeCall?.modality, ctx])

  if (!ctx) return null
  const { activeCall, minimized, fullscreen, setMinimized, endActiveCall } = ctx
  if (!activeCall) return null

  async function handleHangup() {
    if (!activeCall) return
    // En canales: solo el usuario actual sale (los demás siguen en la llamada).
    // En DMs: cierra la sesión completa para los dos.
    if (activeCall.isChannelCall) {
      await leaveCall(activeCall.sessionId).catch(() => {})
    } else {
      await endCall(activeCall.sessionId).catch(() => {})
    }
    endActiveCall()
  }

  function handleToggleFullscreen() {
    ctx?.setFullscreen(!fullscreen)
  }

  function handleMinimize() {
    userMinimizedRef.current = true
    ctx?.setFullscreen(false)
    setMinimized(true)
  }

  function handleExpand() {
    userMinimizedRef.current = false
    setMinimized(false)
  }

  // ── Layout sizing ───────────────────────────────────────────────
  // CRÍTICO: el CallRoom NUNCA se desmonta ni recibe display:none. Cuando
  // se minimiza, lo posicionamos fixed al tamaño normal pero con opacity:0
  // para que Chrome no pause los tracks de video/screen-share. Esto fixea
  // el bug donde compartir pantalla se suspendía al minimizar.
  const callRoomCls = cn(
    'fixed bg-[#0e0e0e] overflow-hidden transition-[border-radius,box-shadow] duration-150',
    fullscreen
      ? 'inset-0 z-[210]'
      : minimized
        ? 'bottom-4 right-4 w-[360px] max-w-[calc(100vw-2rem)] h-[220px] rounded-xl border border-[#dfe3e6] shadow-2xl opacity-0 pointer-events-none z-[1]'
        : 'bottom-4 right-4 w-[720px] max-w-[calc(100vw-2rem)] h-[480px] rounded-xl border border-[#dfe3e6] shadow-2xl z-[210]'
  )

  return (
    <>
      {/* CallRoom siempre montado, nunca con display:none */}
      <div className={callRoomCls}>
        <CallRoom
          call={activeCall}
          expanded={!minimized}
          onLeave={endActiveCall}
          onScreenShareChange={handleScreenShareChange}
        />
      </div>

      {/* Header overlay con controles — sobre el CallRoom cuando expandido/fullscreen */}
      {!minimized && (
        <div
          className={cn(
            'fixed z-[211] flex items-center gap-1.5 px-3 py-2 bg-black/60 backdrop-blur-md rounded-full shadow-lg',
            fullscreen ? 'top-4 right-4' : 'bottom-[490px] right-4'
          )}
        >
          <UserAvatar
            name={activeCall.title}
            avatarUrl={activeCall.counterpartAvatarUrl}
            size="xs"
          />
          <span className="text-xs font-bold text-white max-w-[140px] truncate">
            {activeCall.title}
          </span>
          <span className="text-[10px] text-white/70 font-bold uppercase tracking-wide">
            {activeCall.modality === 'voice'
              ? 'voz'
              : activeCall.modality === 'video'
                ? 'video'
                : 'pantalla'}
          </span>
          <div className="ml-1 flex items-center gap-1 border-l border-white/15 pl-1.5">
            <button
              type="button"
              onClick={handleMinimize}
              title="Minimizar"
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors text-white/85"
            >
              <Minimize2Icon size={13} />
            </button>
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors text-white/85"
            >
              {fullscreen ? <ShrinkIcon size={13} /> : <ExpandIcon size={13} />}
            </button>
            <button
              type="button"
              onClick={handleHangup}
              title="Colgar"
              className="w-7 h-7 rounded-full bg-[#b31b25] hover:bg-[#b31b25]/90 flex items-center justify-center transition-colors text-white"
            >
              <PhoneOffIcon size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Chip minimizado — visible solo cuando minimized */}
      {minimized && (
        <div className="fixed bottom-4 right-4 z-[211] bg-white border border-[#dfe3e6] rounded-full shadow-xl flex items-center gap-2 px-3 py-2">
          <UserAvatar
            name={activeCall.title}
            avatarUrl={activeCall.counterpartAvatarUrl}
            size="xs"
          />
          <span className="text-xs font-semibold text-[#2a2a2a] max-w-[120px] truncate">
            {activeCall.title}
          </span>
          <span className="text-[10px] text-[#00675c] font-bold uppercase">
            en llamada
          </span>
          <button
            type="button"
            onClick={handleExpand}
            title="Expandir"
            className="w-7 h-7 rounded-full bg-[#00675c]/10 text-[#00675c] hover:bg-[#00675c]/20 flex items-center justify-center transition-colors"
          >
            <Maximize2Icon size={13} />
          </button>
          <button
            type="button"
            onClick={handleHangup}
            title="Colgar"
            className="w-7 h-7 rounded-full bg-[#b31b25] text-white hover:bg-[#b31b25]/90 flex items-center justify-center transition-colors"
          >
            <PhoneOffIcon size={13} />
          </button>
        </div>
      )}
    </>
  )
}
