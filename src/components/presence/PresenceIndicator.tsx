'use client'

import { cn } from '@/lib/utils'
import type { EffectivePresenceStatus } from '@/types/db'

interface PresenceIndicatorProps {
  status: EffectivePresenceStatus
  /** Tamaño del dot. xs=6px sm=8px md=10px */
  size?: 'xs' | 'sm' | 'md'
  /** Si true, también muestra el label de texto al lado del dot. */
  showLabel?: boolean
  /** Posicionar absolutamente sobre un avatar. Por defecto inline. */
  overlay?: boolean
  className?: string
}

const STATUS_COLOR: Record<EffectivePresenceStatus, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  almuerzo: 'bg-orange-500',
  en_llamada: 'bg-red-500',
}

const STATUS_LABEL: Record<EffectivePresenceStatus, string> = {
  online: 'En línea',
  away: 'Ausente',
  almuerzo: 'En almuerzo',
  en_llamada: 'En llamada',
}

const STATUS_EMOJI: Record<EffectivePresenceStatus, string> = {
  online: '',
  away: '',
  almuerzo: '🍔',
  en_llamada: '📹',
}

const SIZE_DOT: Record<NonNullable<PresenceIndicatorProps['size']>, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
}

export function PresenceIndicator({
  status,
  size = 'sm',
  showLabel = false,
  overlay = false,
  className,
}: PresenceIndicatorProps) {
  const colorCls = STATUS_COLOR[status]
  const dotCls = SIZE_DOT[size]
  const label = STATUS_LABEL[status]
  const emoji = STATUS_EMOJI[status]

  // Modo overlay: pequeño badge sobre la esquina inferior-derecha de un avatar.
  // El componente padre debe ser `relative`.
  if (overlay) {
    return (
      <span
        className={cn(
          'absolute bottom-0 right-0 rounded-full ring-2 ring-fm-surface-container-lowest',
          colorCls,
          // Un pelín más grande en overlay para verse bien sobre el avatar
          size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3',
          className
        )}
        title={label}
        aria-label={label}
      />
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={label}>
      <span className={cn('rounded-full', dotCls, colorCls)} aria-hidden="true" />
      {showLabel && (
        <span className="text-xs text-fm-on-surface-variant">
          {emoji && <span className="mr-0.5">{emoji}</span>}
          {label}
        </span>
      )}
    </span>
  )
}
