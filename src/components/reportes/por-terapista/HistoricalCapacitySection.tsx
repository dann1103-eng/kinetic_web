import { AccordionSection } from '@/components/ui/AccordionSection'
import { fmtHours, type TherapistHistoricalCapacity } from '@/lib/domain/reports/therapist'

interface Props {
  data: TherapistHistoricalCapacity
}

/** Color de celda según ocupación (mismo umbral que /operacion/capacidad-terapistas). */
function cellTone(pct: number | null): { bg: string; text: string } {
  if (pct == null) return { bg: 'bg-fm-surface-container', text: 'text-fm-on-surface-variant' }
  if (pct < 60) return { bg: 'bg-emerald-100', text: 'text-emerald-900' }
  if (pct <= 85) return { bg: 'bg-amber-100', text: 'text-amber-900' }
  return { bg: 'bg-rose-100', text: 'text-rose-900' }
}

function trendIcon(delta: number | null): { icon: string; color: string } {
  if (delta == null) return { icon: '—', color: 'text-fm-on-surface-variant' }
  if (delta > 5) return { icon: '↑', color: 'text-rose-700' }    // subiendo = más cargado
  if (delta < -5) return { icon: '↓', color: 'text-emerald-700' } // bajando = aliviando
  return { icon: '→', color: 'text-fm-on-surface-variant' }       // estable
}

export function HistoricalCapacitySection({ data }: Props) {
  const { monthLabels, rows } = data

  if (rows.length === 0) {
    return (
      <AccordionSection
        title="Capacidad histórica"
        subtitle={`Últimos ${data.monthsBack} meses`}
      >
        <p className="text-sm text-fm-on-surface-variant py-4">
          No hay terapistas con rol activo.
        </p>
      </AccordionSection>
    )
  }

  return (
    <AccordionSection
      title="Capacidad histórica"
      subtitle={`Ocupación mensual · últimos ${data.monthsBack} meses`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fm-outline-variant/30">
              <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider sticky left-0 bg-fm-background">
                Terapista
              </th>
              {monthLabels.map((label) => (
                <th
                  key={label}
                  className="text-center py-2 px-2 font-extrabold text-fm-on-surface-variant uppercase text-[10px] tracking-wider min-w-[64px]"
                >
                  {label}
                </th>
              ))}
              <th className="text-right py-2 pl-3 font-extrabold text-fm-on-surface-variant uppercase text-[10px] tracking-wider">
                Promedio
              </th>
              <th className="text-center py-2 pl-2 pr-1 font-extrabold text-fm-on-surface-variant uppercase text-[10px] tracking-wider">
                Tendencia
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const trend = trendIcon(r.trendDelta)
              return (
                <tr key={r.therapist.id} className="border-b border-fm-outline-variant/10 hover:bg-fm-surface-container-low/40">
                  <td className="py-2 pr-4 sticky left-0 bg-fm-background">
                    <div className="font-semibold text-fm-on-surface">{r.therapist.full_name}</div>
                    <div className="text-[10px] text-fm-on-surface-variant capitalize">
                      {r.therapist.role.replace('_', ' ')}
                      {r.therapist.max_hours_per_week != null && ` · ${r.therapist.max_hours_per_week}h/sem`}
                    </div>
                  </td>
                  {r.cells.map((c) => {
                    const tone = cellTone(c.occupancyPct)
                    return (
                      <td key={`${c.year}-${c.month}`} className="py-1 px-1 text-center">
                        <div
                          className={`rounded-md px-1 py-1.5 ${tone.bg} ${tone.text}`}
                          title={`${c.label}: ${c.hoursWorked.toFixed(1)}h trabajadas${c.hoursContracted != null ? ` / ${c.hoursContracted.toFixed(1)}h contratadas` : ' (sin contrato)'}`}
                        >
                          <div className="text-xs font-extrabold tabular-nums">
                            {c.occupancyPct == null ? '—' : `${c.occupancyPct.toFixed(0)}%`}
                          </div>
                          <div className="text-[9px] opacity-70 tabular-nums">
                            {fmtHours(c.hoursWorked)}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-2 pl-3 text-right font-bold text-fm-on-surface tabular-nums">
                    {r.averagePct == null ? '—' : `${r.averagePct.toFixed(0)}%`}
                  </td>
                  <td className={`py-2 pl-2 pr-1 text-center text-lg font-extrabold ${trend.color}`}>
                    {trend.icon}
                    {r.trendDelta != null && Math.abs(r.trendDelta) > 5 && (
                      <span className="text-[10px] block leading-none mt-0.5">
                        {r.trendDelta > 0 ? '+' : ''}{r.trendDelta.toFixed(0)}pp
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4 text-[11px] text-fm-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
          &lt; 60%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
          60–85%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300"></span>
          &gt; 85%
        </span>
        <span className="ml-auto italic">
          Tendencia: ↑ subiendo (más carga) · ↓ bajando · → estable (±5pp)
        </span>
      </div>
    </AccordionSection>
  )
}
