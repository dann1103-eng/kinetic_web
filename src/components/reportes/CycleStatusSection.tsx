import { AccordionSection } from '@/components/ui/AccordionSection'
import { DateRangeFilter } from './DateRangeFilter'
import { ReportDownloadButton } from './ReportDownloadButton'
import { formatPercent, type CycleStatusBreakdown } from '@/lib/domain/reports/financial'

interface Props {
  data: CycleStatusBreakdown
  fromDate: string
  toDate: string
}

export function CycleStatusSection({ data, fromDate, toDate }: Props) {
  const { rows, totals, topReasons } = data
  const downloadHref = `/api/reportes/financieros/ciclos?from=${fromDate}&to=${toDate}`

  return (
    <AccordionSection
      title="Ciclos generados vs cancelados"
      subtitle={`${totals.generated} cobrados · ${totals.cancelled} cancelados · ${formatPercent(totals.cancellationRate, 1)} cancelación`}
      headerRight={
        <div className="flex items-center gap-3">
          <DateRangeFilter
            paramFrom="cyclesFrom"
            paramTo="cyclesTo"
            initialFrom={fromDate}
            initialTo={toDate}
          />
          <ReportDownloadButton
            href={downloadHref}
            filename={`kinetic-ciclos-${fromDate}-a-${toDate}`}
          />
        </div>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Cobrados" value={String(totals.generated)} accent="#00675c" />
        <KpiCard label="Cancelados" value={String(totals.cancelled)} accent="#b31b25" />
        <KpiCard
          label="Tasa cancelación"
          value={formatPercent(totals.cancellationRate, 1)}
          accent="#595c5e"
        />
      </div>

      {/* Tabla por mes */}
      <h3 className="text-sm font-extrabold text-fm-on-surface mb-2">Detalle por mes</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant py-4">Sin datos en el rango seleccionado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fm-surface-container-high">
                <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Mes
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Cobrados
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Cancelados
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Total
                </th>
                <th className="text-right py-2 pl-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Tasa cancelación
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.month}
                  className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
                >
                  <td className="py-3 pr-4 font-semibold text-fm-on-surface">{r.monthLabel}</td>
                  <td className="py-3 px-4 text-right font-bold" style={{ color: '#00675c' }}>
                    {r.generatedCount}
                  </td>
                  <td className="py-3 px-4 text-right font-bold" style={{ color: '#b31b25' }}>
                    {r.cancelledCount}
                  </td>
                  <td className="py-3 px-4 text-right text-fm-on-surface">{r.totalCount}</td>
                  <td className="py-3 pl-4 text-right text-fm-on-surface">
                    {formatPercent(r.cancellationRate, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top motivos */}
      {topReasons.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-extrabold text-fm-on-surface mb-2">Top motivos de cancelación</h3>
          <ul className="space-y-1.5">
            {topReasons.map((tr, i) => (
              <li
                key={`${tr.reason}-${i}`}
                className="flex items-center justify-between border-b border-fm-surface-container-low py-2"
              >
                <span className="text-sm text-fm-on-surface">
                  <span className="text-fm-on-surface-variant mr-2">{i + 1}.</span>
                  {tr.reason}
                </span>
                <span className="text-sm font-bold" style={{ color: '#b31b25' }}>
                  {tr.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AccordionSection>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-fm-background border border-fm-surface-container-high p-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </p>
      <p className="text-3xl font-black mt-2" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}
