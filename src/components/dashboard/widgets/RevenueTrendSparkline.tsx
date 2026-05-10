import type { RevenueDay } from '@/lib/domain/dashboard-widgets'

interface Props {
  series: RevenueDay[]
  totalUsd: number
  periodLabel: string
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(n >= 1000 ? 0 : 2)}`
}

export function RevenueTrendSparkline({
  series,
  totalUsd,
  periodLabel,
}: Props) {
  const max = Math.max(1, ...series.map((d) => d.amountUsd))
  const todayDay = new Date().getDate()
  const peakDay = series.reduce(
    (best, cur) => (cur.amountUsd > best.amountUsd ? cur : best),
    series[0] ?? { day: 0, amountUsd: 0 },
  )

  return (
    <section className="rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            Ingresos · {periodLabel}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-fm-on-surface tabular-nums leading-none">
            {fmtMoney(totalUsd)}
          </h2>
        </div>
        {peakDay.amountUsd > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider font-bold text-fm-on-surface-variant">
              Día pico
            </p>
            <p className="text-base font-semibold text-fm-on-surface tabular-nums mt-0.5">
              {fmtMoney(peakDay.amountUsd)}
            </p>
            <p className="text-xs text-fm-on-surface-variant">
              día {peakDay.day}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-end gap-[3px] h-28">
        {series.map((d) => {
          const ratio = d.amountUsd / max
          const minVisible = d.amountUsd > 0 ? 0.04 : 0
          const heightPct = Math.max(minVisible, ratio) * 100
          const isToday = d.day === todayDay
          return (
            <div
              key={d.day}
              className="flex-1 flex flex-col justify-end group relative"
              title={`Día ${d.day}: ${fmtMoney(d.amountUsd)}`}
            >
              <div
                className={`rounded-sm transition-colors ${
                  d.amountUsd === 0
                    ? 'bg-fm-outline-variant/20'
                    : isToday
                      ? 'bg-fm-primary'
                      : 'bg-fm-primary/40 group-hover:bg-fm-primary/70'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant tabular-nums">
        <span>1</span>
        <span className="text-fm-primary">Hoy · {todayDay}</span>
        <span>{series.length}</span>
      </div>
    </section>
  )
}
