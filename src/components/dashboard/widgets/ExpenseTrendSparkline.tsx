import Link from 'next/link'
import type { CurrentMonthExpenseSummary } from '@/lib/domain/reports/expenses'

interface Props {
  data: CurrentMonthExpenseSummary
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(n >= 1000 ? 0 : 2)}`
}

const VIEW_W = 800
const VIEW_H = 140
const PADDING_X = 4
const PADDING_TOP = 8
const PADDING_BOTTOM = 4

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  const segments: string[] = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const tension = 6
    const cp1x = p1.x + (p2.x - p0.x) / tension
    const cp1y = p1.y + (p2.y - p0.y) / tension
    const cp2x = p2.x - (p3.x - p1.x) / tension
    const cp2y = p2.y - (p3.y - p1.y) / tension
    segments.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`)
  }
  return segments.join(' ')
}

/**
 * Widget de egresos del mes. Mismo formato visual que RevenueTrendSparkline
 * pero con paleta de egresos (rojo Kinetic). La línea muestra el acumulado
 * de gastos generales día por día; el total incluye también la planilla
 * (que se carga de una vez al sellar).
 */
export function ExpenseTrendSparkline({ data }: Props) {
  const { generalByDay, totalUsd, payrollCostUsd, generalExpensesUsd, monthLabel } = data
  const todayDay = new Date().getDate()

  // Acumulado por día para la línea
  const accSeries = generalByDay.reduce<Array<{ day: number; amountUsd: number }>>(
    (out, d) => {
      const prev = out.length > 0 ? out[out.length - 1].amountUsd : 0
      out.push({ day: d.day, amountUsd: prev + d.amountUsd })
      return out
    },
    [],
  )

  const max = Math.max(1, ...accSeries.map((d) => d.amountUsd))
  const usableW = VIEW_W - PADDING_X * 2
  const usableH = VIEW_H - PADDING_TOP - PADDING_BOTTOM

  const points = accSeries.map((d, i) => {
    const x = accSeries.length > 1
      ? PADDING_X + (i / (accSeries.length - 1)) * usableW
      : VIEW_W / 2
    const y = PADDING_TOP + (1 - d.amountUsd / max) * usableH
    return { x, y, day: d.day }
  })

  const linePath = smoothPath(points)
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${VIEW_H} L ${points[0].x} ${VIEW_H} Z`
    : ''
  const todayPoint = points.find((p) => p.day === todayDay)

  return (
    <section
      className="rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-6 md:p-8"
      style={{ color: '#b31b25' }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            Egresos · {monthLabel}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-fm-on-surface tabular-nums leading-none">
            {fmtMoney(totalUsd)}
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-fm-on-surface-variant">
            <span>
              Planilla:{' '}
              <span className="font-bold tabular-nums text-fm-on-surface">
                {fmtMoney(payrollCostUsd)}
              </span>
            </span>
            <span>·</span>
            <span>
              Gastos:{' '}
              <span className="font-bold tabular-nums text-fm-on-surface">
                {fmtMoney(generalExpensesUsd)}
              </span>
            </span>
          </div>
        </div>
        <Link
          href="/reportes/egresos"
          className="text-xs font-bold text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          title="Ver detalle de egresos"
        >
          Ver detalle →
        </Link>
      </div>

      <div className="w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height={VIEW_H}
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="expense-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#expense-area-fill)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {todayPoint && (
            <circle
              cx={todayPoint.x}
              cy={todayPoint.y}
              r="4"
              fill="currentColor"
              stroke="white"
              strokeWidth="1.5"
            />
          )}
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant tabular-nums">
        <span>día 1</span>
        <span style={{ color: '#b31b25' }}>hoy · {todayDay}</span>
        <span>día {generalByDay.length}</span>
      </div>

      {generalExpensesUsd === 0 && payrollCostUsd === 0 && (
        <p className="mt-3 text-xs text-fm-on-surface-variant italic">
          Sin egresos registrados este mes. Registrá gastos en{' '}
          <Link href="/reportes/egresos" className="underline hover:text-fm-on-surface">
            /reportes/egresos
          </Link>{' '}
          y aplicá la planilla del mes para ver el costo de planilla.
        </p>
      )}
    </section>
  )
}
