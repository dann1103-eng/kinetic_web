'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronDownIcon, CheckIcon } from 'lucide-react'
import { setPresenceStatus } from '@/app/actions/presence'
import { useUserOrNull } from '@/contexts/UserContext'
import { useUsersPresence } from '@/hooks/useUsersPresence'
import { PresenceIndicator } from './PresenceIndicator'
import { cn } from '@/lib/utils'
import type { PresenceStatus, EffectivePresenceStatus } from '@/types/db'

const OPTIONS: Array<{ value: PresenceStatus; label: string; description: string }> = [
  { value: 'online', label: 'En línea', description: 'Disponible para mensajes y llamadas' },
  { value: 'away', label: 'Ausente', description: 'Aviso a tus compañeros que no estás' },
  { value: 'almuerzo', label: 'En almuerzo', description: 'Volveré en un rato' },
]

/**
 * Dropdown que el usuario usa para setear su propio estado.
 * Si el usuario está en una llamada, muestra "En llamada" como override
 * pero deshabilitado — para cambiarlo tiene que terminar la llamada primero.
 */
export function PresenceSelector() {
  const user = useUserOrNull()
  const { getEffective, presence } = useUsersPresence()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const effective: EffectivePresenceStatus = user ? getEffective(user.id) : 'online'
  const manualCurrent: PresenceStatus = user
    ? presence.get(user.id) ?? 'online'
    : 'online'
  const inCallOverride = effective === 'en_llamada'

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  if (!user) return null

  function handleSelect(s: PresenceStatus) {
    if (pending) return
    startTransition(async () => {
      await setPresenceStatus(s)
      setOpen(false)
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={inCallOverride ? 'En llamada — cambia tu estado al terminar' : 'Cambiar estado'}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-fm-on-surface-variant hover:bg-fm-surface-container-low transition-colors"
      >
        <PresenceIndicator status={effective} size="sm" />
        <span>
          {effective === 'en_llamada'
            ? 'En llamada'
            : effective === 'almuerzo'
              ? 'En almuerzo'
              : effective === 'away'
                ? 'Ausente'
                : 'En línea'}
        </span>
        <ChevronDownIcon size={12} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-60 bg-fm-surface-container-lowest border border-fm-surface-container-high rounded-lg shadow-xl overflow-hidden z-[100]">
          {inCallOverride && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-fm-surface-container-high text-[11px] text-fm-on-surface-variant">
              Estás en llamada. El estado se ajusta automáticamente al terminar.
            </div>
          )}
          {OPTIONS.map((opt) => {
            const selected = manualCurrent === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                disabled={pending}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-fm-background transition-colors disabled:opacity-50',
                  selected && 'bg-fm-primary/5'
                )}
              >
                <PresenceIndicator status={opt.value} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fm-on-surface">{opt.label}</div>
                  <div className="text-[11px] text-fm-on-surface-variant truncate">
                    {opt.description}
                  </div>
                </div>
                {selected && <CheckIcon size={14} className="text-fm-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
