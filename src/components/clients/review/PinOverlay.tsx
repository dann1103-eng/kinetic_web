'use client'

import type { ReviewPin } from '@/types/db'

interface PinOverlayProps {
  pin: ReviewPin
  selected: boolean
  onClick: () => void
  onHoverStart?: () => void
  onHoverEnd?: () => void
}

export function PinOverlay({ pin, selected, onClick, onHoverStart, onHoverEnd }: PinOverlayProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ left: `${pin.pos_x_pct}%`, top: `${pin.pos_y_pct}%` }}
      aria-label={`Pin ${pin.pin_number}`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md transition-all ${
          selected
            ? 'bg-[#1FA4DA] text-white ring-2 ring-white scale-110'
            : 'bg-white text-[#1FA4DA] ring-2 ring-[#1FA4DA] hover:scale-110'
        }`}
      >
        {pin.pin_number}
      </div>
    </button>
  )
}
