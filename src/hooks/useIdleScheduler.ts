'use client'

import { useEffect, useState } from 'react'

/**
 * Calcula el próximo "checkpoint" de presencia basado en hora local.
 * - Si h < 18: siguiente = hoy 18:00
 * - Si h >= 18 || h < 6 (jornada nocturna): siguiente checkpoint en 2h alineado a 18+2k
 * - Si h >= 6 && h < 18 (día normal): retorna 18:00 de hoy
 * Retorna `Date | null` (null si no aplica).
 */
function nextCheckpoint(now: Date): Date {
  const h = now.getHours()
  // Día normal (6am - 6pm): siguiente check es 18:00 de hoy
  if (h < 18 && h >= 6) {
    const d = new Date(now)
    d.setHours(18, 0, 0, 0)
    return d
  }
  // Jornada nocturna (18:00 - 06:00): cada 2 horas
  // h >= 18 || h < 6
  const d = new Date(now)
  if (h < 6) {
    // Madrugada (0-5h): siguiente checkpoint a las h+1 par o múltiplo (20, 22, 0, 2, 4, 6)
    // Como 18+2k mod 24 = {18, 20, 22, 0, 2, 4}, el siguiente es el primer múltiplo > h
    const validHours = [0, 2, 4, 6]
    const nextH = validHours.find((x) => x > h) ?? 6
    d.setHours(nextH, 0, 0, 0)
  } else {
    // h >= 18 (tarde/noche): siguiente checkpoint a las {20, 22, 24}
    if (h < 20) d.setHours(20, 0, 0, 0)
    else if (h < 22) d.setHours(22, 0, 0, 0)
    else {
      // h >= 22: ir a medianoche
      d.setDate(d.getDate() + 1)
      d.setHours(0, 0, 0, 0)
    }
  }
  return d
}

/**
 * Hook que agenda checkpoints de presencia ("¿Sigues en línea?") cada 6pm + 2h durante la noche.
 * Cuando llega el checkpoint, llama a `onCheckpoint()`. El consumer debe abrir el modal.
 * Después de que el usuario confirma o se hace logout, llamar `reschedule()` para agendar el siguiente.
 */
export function useIdleScheduler({
  enabled,
  onCheckpoint,
}: {
  enabled: boolean
  onCheckpoint: () => void
}) {
  const [reschedTick, setReschedTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const now = new Date()
    const target = nextCheckpoint(now)
    const ms = Math.max(1000, target.getTime() - now.getTime())
    const t = window.setTimeout(() => {
      onCheckpoint()
    }, ms)
    return () => window.clearTimeout(t)
  }, [enabled, onCheckpoint, reschedTick])

  function reschedule() {
    setReschedTick((n) => n + 1)
  }

  return { reschedule }
}
