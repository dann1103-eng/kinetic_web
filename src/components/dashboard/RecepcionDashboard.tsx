import Link from 'next/link'
import type { RecepcionDashboardData } from '@/lib/domain/global-dashboard'
import { QuickLinks } from './MgmtDashboard'

interface Props {
  data: RecepcionDashboardData
  greeting: string
  /** Si true, muestra header como "Contabilidad". */
  contableMode?: boolean
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function periodLabel(periodMonth: string): string {
  return new Date(`${periodMonth.slice(0, 10)}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

export function RecepcionDashboard({ data, greeting, contableMode }: Props) {
  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fm-on-surface">{greeting}</h1>
        <p className="text-sm text-fm-on-surface-variant capitalize">
          {contableMode ? 'Contabilidad' : 'Recepción'} · {data.periodLabel}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ingresos del mes" value={fmtMoney(data.monthlyRevenueUsd)} tone="ok" />
        <Kpi label="Ciclos pagados" value={data.cyclesPaidThisMonth} tone="info" />
        <Kpi
          label="Anulados"
          value={data.cyclesCancelledThisMonth}
          tone={data.cyclesCancelledThisMonth > 0 ? 'warn' : 'neutral'}
        />
        <Kpi
          label="Por cobrar (sin ciclo del mes)"
          value={data.childrenWithoutCurrentCycle.length}
          tone={data.childrenWithoutCurrentCycle.length > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* Por cobrar */}
      {data.childrenWithoutCurrentCycle.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-sm font-semibold text-fm-on-surface mb-1">
            Niños activos sin ciclo del mes ({data.childrenWithoutCurrentCycle.length})
          </h2>
          <p className="text-xs text-fm-on-surface-variant mb-3">
            Estos niños tienen plan activo pero no han pagado el mes en curso.
            Recordales el cobro y marcá pago desde su ficha.
          </p>
          <ul className="divide-y divide-fm-outline-variant/15">
            {data.childrenWithoutCurrentCycle.map((c) => (
              <li
                key={c.id}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-fm-on-surface">{c.full_name}</span>
                <Link
                  href={`/familias/${c.family_id}/children/${c.id}`}
                  className="text-xs text-fm-primary hover:underline"
                >
                  Ir a ficha →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pagos recientes */}
      {data.recentCycles.length > 0 && (
        <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
          <h2 className="text-sm font-semibold text-fm-on-surface mb-3">
            Pagos del mes (últimos {data.recentCycles.length})
          </h2>
          <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container-low text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Niño/a</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Mes</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Pagado el</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Monto</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Método</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCycles.map((c) => (
                  <tr key={c.id} className="border-t border-fm-outline-variant/15">
                    <td className="px-3 py-1.5">
                      {c.child ? (
                        <Link
                          href={`/familias/${c.child.family_id}/children/${c.child.id}`}
                          className="hover:underline text-fm-on-surface"
                        >
                          {c.child.full_name}
                        </Link>
                      ) : (
                        <span className="text-fm-on-surface-variant italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 capitalize text-fm-on-surface-variant">
                      {periodLabel(c.period_month)}
                    </td>
                    <td className="px-3 py-1.5 text-fm-on-surface-variant tabular-nums">
                      {new Date(c.paid_at).toLocaleDateString('es-SV')}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {fmtMoney(c.payment_amount_usd)}
                    </td>
                    <td className="px-3 py-1.5 text-fm-on-surface-variant">
                      {c.payment_method ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <QuickLinks
        items={[
          { href: '/familias', label: 'Familias', icon: 'groups' },
          { href: '/agenda', label: 'Agenda', icon: 'calendar_today' },
          ...(contableMode
            ? [{ href: '/billing', label: 'Facturación', icon: 'receipt_long' }]
            : []),
        ]}
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'ok' | 'info' | 'warn' | 'neutral'
}) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    neutral: 'bg-fm-surface-container-low border-fm-outline-variant/20 text-fm-on-surface',
  }[tone]
  return (
    <div className={`rounded-xl border p-4 ${colors}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
