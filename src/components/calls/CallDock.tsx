'use client'

import dynamic from 'next/dynamic'
import { Minimize2Icon, Maximize2Icon, PhoneOffIcon } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useActiveCallOrNull } from '@/contexts/ActiveCallContext'
import { endCall } from '@/app/actions/calls'

// CallRoom incluye el SDK pesado de LiveKit (~150KB gz). Se carga solo
// cuando hay una llamada activa, para no inflar el bundle del CRM normal.
const CallRoom = dynamic(
  () => import('./CallRoom').then((m) => m.CallRoom),
  { ssr: false, loading: () => <div className="p-4 text-xs text-[#595c5e]">Cargando llamada…</div> }
)

export function CallDock() {
  const ctx = useActiveCallOrNull()
  if (!ctx) return null
  const { activeCall, minimized, setMinimized, endActiveCall } = ctx
  if (!activeCall) return null

  async function handleHangup() {
    if (!activeCall) return
    await endCall(activeCall.sessionId).catch(() => {})
    endActiveCall()
  }

  const modalityIsVoice = activeCall.modality === 'voice'

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[210] bg-white border border-[#dfe3e6] rounded-full shadow-xl flex items-center gap-2 px-3 py-2">
        <UserAvatar
          name={activeCall.title}
          avatarUrl={activeCall.counterpartAvatarUrl}
          size="xs"
        />
        <span className="text-xs font-semibold text-[#2a2a2a] max-w-[120px] truncate">
          {activeCall.title}
        </span>
        <span className="text-[10px] text-[#00675c] font-bold uppercase">en llamada</span>
        <button
          type="button"
          onClick={() => setMinimized(false)}
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
        {/* CallRoom se mantiene montado en hidden para no perder la conexión */}
        <div className="hidden">
          <CallRoom call={activeCall} expanded={false} onLeave={endActiveCall} />
        </div>
      </div>
    )
  }

  // Expandido — overlay grande pero no fullscreen (el CRM sigue visible detrás).
  const widthCls = modalityIsVoice ? 'w-[360px]' : 'w-[720px] max-w-[calc(100vw-2rem)]'
  const heightCls = modalityIsVoice ? 'h-[420px]' : 'h-[480px]'

  return (
    <div className={`fixed bottom-4 right-4 z-[210] ${widthCls} ${heightCls} bg-white border border-[#dfe3e6] rounded-xl shadow-2xl flex flex-col overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-[#dfe3e6] flex items-center justify-between bg-[#00675c]/5">
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar
            name={activeCall.title}
            avatarUrl={activeCall.counterpartAvatarUrl}
            size="xs"
          />
          <span className="text-xs font-bold text-[#2a2a2a] truncate">{activeCall.title}</span>
          <span className="text-[10px] text-[#00675c] font-bold uppercase">
            {activeCall.modality === 'voice' ? 'voz' : activeCall.modality === 'video' ? 'video' : 'pantalla'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            title="Minimizar"
            className="w-7 h-7 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors text-[#595c5e]"
          >
            <Minimize2Icon size={14} />
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
      </div>
      <div className="flex-1 min-h-0 bg-[#0e0e0e]">
        <CallRoom call={activeCall} expanded onLeave={endActiveCall} />
      </div>
    </div>
  )
}
