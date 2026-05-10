'use client'

import { useEffect, useState } from 'react'

interface DateAnchorProps {
  weekday: string
  day: string
  month: string
  initialTimeLabel: string
  className?: string
}

const TZ = 'America/El_Salvador'

function formatNow(): string {
  return new Intl.DateTimeFormat('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date())
}

export function DateAnchor({
  weekday,
  day,
  month,
  initialTimeLabel,
  className = '',
}: DateAnchorProps) {
  const [timeLabel, setTimeLabel] = useState(initialTimeLabel)

  useEffect(() => {
    setTimeLabel(formatNow())
    const id = setInterval(() => setTimeLabel(formatNow()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={className}>
      <div className="space-y-2">
        <span className="block text-2xl font-semibold capitalize text-fm-on-surface-variant">
          {weekday}
        </span>
        <h1 className="font-extrabold leading-none tracking-tight text-fm-on-surface text-[64px] sm:text-[84px]">
          {day}
          <br />
          <span className="uppercase">{month}</span>
        </h1>
      </div>
      <div className="mt-12 space-y-6 pt-8 border-t border-fm-outline-variant/30">
        <div>
          <div className="text-xl font-semibold tabular-nums text-fm-on-surface">
            {timeLabel}
          </div>
          <div className="text-xs uppercase tracking-wider font-bold text-fm-on-surface-variant mt-1">
            San Salvador
          </div>
        </div>
      </div>
    </div>
  )
}
