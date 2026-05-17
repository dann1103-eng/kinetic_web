import { AccordionSection } from '@/components/ui/AccordionSection'
import { YearFilterSelect } from './YearFilterSelect'
import { ReportDownloadButton } from './ReportDownloadButton'
import { formatUsd, type MonthlyRevenueRow } from '@/lib/domain/reports/financial'

interface Props {
  year: number
  rows: MonthlyRevenueRow[]
  /** Año actual del sistema; default del selector y tope superior. */
  currentYear: number
}

export function MonthlyRevenueSection({ year, rows, currentYear }: Props) {
  const totalRevenue = rows.reduce((s, r) => s + r.netRevenueUsd, 0)
  const totalGenerated = rows.reduce((s, r) => s + r.generatedCount, 0)
  const max = Math.max(1, ...rows.map((r) => r.netRevenueUsd))

  const downloadHref = `/api/reportes/financieros/ingresos-mensuales?year=${year}`

  return (
    <AccordionSection
      title="Ingresos mensuales"
      subtitle={`${year} · ${formatUsd(totalRevenue)} · ${totalGenerated} ciclos`}
      defaultOpen
      headerRight={
        <div className="flex items-center gap-3">
          <YearFilterSelect
            paramName="year"
            value={year}
            fromYear={currentYear - 4}
            toYear={currentYear}
          />
          <ReportDownloadButton
            href={downloadHref}
            filename={`kinetic-ingresos-mensuales-${year}`}
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
                Cobrados
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Cancelados
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Con descuento
              </th>
              <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Niños únicos
              </th>
              <th className="text-right py-2 pl-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                Ingreso (USD)
              </th>
              <th className="py-2 pl-4 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const widthPct = (r.netRevenueUsd / max) * 100
              return (
                <tr
                  key={r.month}
                  className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
                >
                  <td className="py-3 pr-4 font-semibold text-fm-on-surface">{r.monthLabel}</td>
                  <td className="py-3 px-4 text-right text-fm-on-surface">{r.generatedCount}</td>
                  <td className="py-3 px-4 text-right text-fm-on-surface-variant">{r.cancelledCount}</td>
                  <td className="py-3 px-4 text-right text-fm-on-surface-variant">{r.discountAppliedCount}</td>
                  <td className="py-3 px-4 text-right text-fm-on-surface-variant">{r.uniqueChildrenPaid}</td>
                  <td className="py-3 pl-4 text-right font-extrabold text-fm-on-surface">
                    {formatUsd(r.netRevenueUsd)}
                  </td>
                  <td className="py-3 pl-4">
                    <div className="w-full bg-fm-surface-container dark:bg-fm-surface-container-high rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: '#00675c',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-fm-on-surface/40">
              <td className="py-3 pr-4 font-extrabold text-fm-on-surface">Total {year}</td>
              <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface">{totalGenerated}</td>
              <td className="py-3 px-4 text-right text-fm-on-surface-variant">—</td>
              <td className="py-3 px-4 text-right text-fm-on-surface-variant">—</td>
              <td className="py-3 px-4 text-right text-fm-on-surface-variant">—</td>
              <td
                className="py-3 pl-4 text-right text-lg font-black"
                style={{ color: '#00675c' }}
              >
                {formatUsd(totalRevenue)}
              </td>
              <td className="py-3 pl-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </AccordionSection>
  )
}
