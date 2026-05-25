'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import type { Appointment } from '@/types/db'

type AppointmentWithChild = Appointment & {
  child_full_name?: string
  child_preferred_name?: string
}

interface TimelineRowProps {
  weekday: string
  day: string
  month: string
  appointments: AppointmentWithChild[]
  colorIndex: number
}

// Paleta inspirada en los colores Kinetic: teal #00675c y rojo #b31b25.
// Variaciones suaves para distinguir días consecutivos sin perder identidad visual.
const ROW_COLORS = [
  { light: '#cfe5e1', dark: '#1c3a36' }, // teal claro (Kinetic primario)
  { light: '#f3d2d4', dark: '#4a1f23' }, // rojo coral suave (Kinetic acento)
  { light: '#dfe8e3', dark: '#283832' }, // verde-gris (terciario neutro)
]

function getHourBuckets(appts: AppointmentWithChild[]): number[] {
  if (appts.length === 0) return []
  const hours = new Set<number>()
  for (const a of appts) {
    const h = new Date(a.starts_at).getHours()
    hours.add(h)
  }
  // Add a leading and trailing hour for visual padding
  const sorted = Array.from(hours).sort((a, b) => a - b)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const expanded = new Set(sorted)
  if (first > 0) expanded.add(first - 1)
  if (last < 23) expanded.add(last + 1)
  return Array.from(expanded).sort((a, b) => a - b)
}

function hourLabel(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${period}`
}

export function TimelineRow({
  weekday,
  day,
  month,
  appointments,
  colorIndex,
}: TimelineRowProps) {
  const palette = ROW_COLORS[colorIndex % ROW_COLORS.length]
  const hours = getHourBuckets(appointments)
  const apptsByHour: Record<number, AppointmentWithChild[]> = {}
  for (const a of appointments) {
    const h = new Date(a.starts_at).getHours()
    apptsByHour[h] = apptsByHour[h] ?? []
    apptsByHour[h].push(a)
  }

  // El backgroundColor inline necesita responder al tema actual — usamos
  // next-themes en lugar de variantes Tailwind porque los colores vienen de
  // un array dinámico (no se pueden expresar con clases estáticas).
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const bg = mounted && resolvedTheme === 'dark' ? palette.dark : palette.light

  return (
    <div
      className="rounded-[32px] p-6 flex items-stretch gap-6 sm:gap-8 min-h-[180px] text-fm-on-surface"
      style={{ backgroundColor: bg }}
      data-row-color-light={palette.light}
      data-row-color-dark={palette.dark}
      suppressHydrationWarning
    >
      <div className="w-20 sm:w-24 shrink-0">
        <div className="text-sm font-medium opacity-70 capitalize">{weekday}</div>
        <div className="text-3xl sm:text-[32px] font-bold leading-none mt-1">
          {day}
          <br />
          <span className="uppercase">{month}</span>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm font-medium opacity-60">
          Sin citas programadas
        </div>
      ) : (
        <div className="flex-1 flex gap-4 sm:gap-6 pt-6 overflow-x-auto custom-scrollbar">
          {hours.map((h) => {
            const appts = apptsByHour[h] ?? []
            return (
              <div key={h} className="relative shrink-0 min-w-[80px]">
                <div className="absolute -top-6 left-0 text-[10px] font-bold uppercase opacity-50 whitespace-nowrap">
                  {hourLabel(h)}
                </div>
                <div className="w-px bg-on-surface/10 absolute left-0 top-0 bottom-0" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }} />
                {appts.length === 0 ? (
                  <div className="absolute top-2 left-0 -translate-x-1/2 w-3 h-3 rounded-full bg-white/40" />
                ) : (
                  <div className="ml-3 space-y-2">
                    {appts.map((a) => {
                      const childName =
                        a.child_preferred_name ?? a.child_full_name ?? 'Paciente'
                      const service = a.service_type
                        ? a.service_type.replace(/_/g, ' ')
                        : ''
                      return (
                        <div
                          key={a.id}
                          className="px-3 py-1.5 rounded-2xl bg-fm-on-surface text-fm-surface text-xs font-bold shadow-sm whitespace-nowrap"
                          title={`${childName}${service ? ` · ${service}` : ''}`}
                        >
                          <div>{childName}</div>
                          {service && (
                            <div className="text-[10px] font-medium opacity-70 capitalize">
                              {service}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
