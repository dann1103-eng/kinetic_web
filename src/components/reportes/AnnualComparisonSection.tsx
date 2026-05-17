import { AccordionSection } from '@/components/ui/AccordionSection'
import { YearFilterSelect } from './YearFilterSelect'
import { ReportDownloadButton } from './ReportDownloadButton'
import { formatUsd, type AnnualComparisonRow } from '@/lib/domain/reports/financial'

interface Props {
  data: {
    rows: AnnualComparisonRow[]
    currentYear: number
    previousYear: number
    totals: { current: number; previous: number; deltaUsd: number; deltaPct: number | null }
  }
  /** Año actual del sistema; tope superior del selector. */
  systemYear: number
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-700'
  if (delta < 0) return 'text-rose-700'
  return 'text-fm-on-surface-variant'
}

export function AnnualComparisonSection({ data, systemYear }: Props) {
  const { rows, currentYear, previousYear, totals } = data
  const downloadHref = `/api/reportes/financieros/ingresos-anuales?year=${currentYear}`

  return (
    <AccordionSection
      title="Comparativa anual"
      subtitle={`${currentYear} vs ${previousYear} · Δ ${formatUsd(totals.deltaUsd)}`}
      headerRight={
        <div className="flex items-center gap-3">
          <YearFilterSelect
            paramName="annualYear"
            value={currentYear}
            fromYear={systemYear - 4}
            toYear={systemYear}
          />
          <ReportDownloadButton
            href={downloadHref}
            filename={`kinetic-ingresos-anuales-${currentYear}-vs-${previousYear}`}
          />
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fm-surface-container-high">
              <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Mes
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                {previousYear}
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                {currentYear}
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Δ USD
              </th>
              <th className="text-right py-2 pl-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Δ %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.month}
                className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
              >
                <td className="py-3 pr-4 font-semibold text-fm-on-surface">{r.monthShort}</td>
                <td className="py-3 px-4 text-right text-fm-on-surface-variant">
                  {formatUsd(r.previousYearRevenue)}
                </td>
                <td className="py-3 px-4 text-right font-bold text-fm-on-surface">
                  {formatUsd(r.currentYearRevenue)}
                </td>
                <td className={`py-3 px-4 text-right font-bold ${deltaColor(r.deltaUsd)}`}>
                  {r.deltaUsd >= 0 ? '+' : ''}
                  {formatUsd(r.deltaUsd)}
                </td>
                <td className={`py-3 pl-4 text-right ${deltaColor(r.deltaUsd)}`}>
                  {r.deltaPct === null
                    ? '—'
                    : `${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-fm-on-surface/40">
              <td className="py-3 pr-4 font-extrabold text-fm-on-surface">Total</td>
              <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface-variant">
                {formatUsd(totals.previous)}
              </td>
              <td
                className="py-3 px-4 text-right font-black text-lg"
                style={{ color: '#00675c' }}
              >
                {formatUsd(totals.current)}
              </td>
              <td className={`py-3 px-4 text-right font-black text-lg ${deltaColor(totals.deltaUsd)}`}>
                {totals.deltaUsd >= 0 ? '+' : ''}
                {formatUsd(totals.deltaUsd)}
              </td>
              <td className={`py-3 pl-4 text-right font-bold ${deltaColor(totals.deltaUsd)}`}>
                {totals.deltaPct === null
                  ? '—'
                  : `${totals.deltaPct >= 0 ? '+' : ''}${totals.deltaPct.toFixed(1)}%`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </AccordionSection>
  )
}
