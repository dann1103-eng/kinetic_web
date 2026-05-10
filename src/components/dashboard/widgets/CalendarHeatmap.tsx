import type { HeatmapDay } from '@/lib/domain/dashboard-widgets'

interface Props {
  series: HeatmapDay[]
  periodLabel: string
  /** 0=domingo, 1=lunes... corresponde al primer día del mes (1) */
  firstWeekday: number
}

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-fm-surface-container-high text-fm-on-surface-variant/50'
  const ratio = count / max
  if (ratio >= 0.8) return 'bg-fm-primary text-white'
  if (ratio >= 0.6) return 'bg-fm-primary/70 text-white'
  if (ratio >= 0.4) return 'bg-fm-primary/50 text-white'
  if (ratio >= 0.2) return 'bg-fm-primary/30 text-fm-on-surface'
  return 'bg-fm-primary/15 text-fm-on-surface'
}

export function CalendarHeatmap({ series, periodLabel, firstWeekday }: Props) {
  const max = Math.max(...series.map((d) => d.count), 1)
  const todayDay = new Date().getDate()

  // Padding cells antes del día 1 (offset semanal)
  const padding = Array.from({ length: firstWeekday }).map((_, i) => i)

  return (
    <section className="rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-6">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            Carga del mes
          </p>
          <h2 className="text-xl font-semibold text-fm-on-surface mt-1 capitalize">
            {periodLabel}
          </h2>
        </div>
        <p className="text-xs text-fm-on-surface-variant">
          {series.reduce((s, d) => s + d.count, 0)} citas
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant text-center pb-1"
          >
            {d}
          </div>
        ))}
        {padding.map((i) => (
          <div key={`pad-${i}`} className="aspect-square" />
        ))}
        {series.map((d) => {
          const isToday = d.day === todayDay
          return (
            <div
              key={d.day}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] font-semibold tabular-nums ${intensityClass(d.count, max)} ${
                isToday ? 'ring-2 ring-fm-primary ring-offset-1 ring-offset-fm-surface-container-lowest' : ''
              }`}
              title={`Día ${d.day}: ${d.count} citas`}
            >
              <span className="opacity-70">{d.day}</span>
              {d.count > 0 && (
                <span className="text-[11px] font-bold leading-none">
                  {d.count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
        <span>Menos</span>
        <span className="w-3 h-3 rounded-sm bg-fm-primary/15" />
        <span className="w-3 h-3 rounded-sm bg-fm-primary/30" />
        <span className="w-3 h-3 rounded-sm bg-fm-primary/50" />
        <span className="w-3 h-3 rounded-sm bg-fm-primary/70" />
        <span className="w-3 h-3 rounded-sm bg-fm-primary" />
        <span>Más</span>
      </div>
    </section>
  )
}
