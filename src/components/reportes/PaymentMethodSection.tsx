import { AccordionSection } from '@/components/ui/AccordionSection'
import { DateRangeFilter } from './DateRangeFilter'
import { ReportDownloadButton } from './ReportDownloadButton'
import {
  formatUsd,
  formatPercent,
  formatPaymentMethodLabel,
  type PaymentMethodRow,
} from '@/lib/domain/reports/financial'

interface Props {
  rows: PaymentMethodRow[]
  totalUsd: number
  totalCount: number
  fromDate: string
  toDate: string
}

export function PaymentMethodSection({ rows, totalUsd, totalCount, fromDate, toDate }: Props) {
  const downloadHref = `/api/reportes/financieros/metodos-pago?from=${fromDate}&to=${toDate}`

  return (
    <AccordionSection
      title="Pagos por método"
      subtitle={`${formatUsd(totalUsd)} · ${totalCount} ciclos cobrados`}
      headerRight={
        <div className="flex items-center gap-3">
          <DateRangeFilter
            paramFrom="pmFrom"
            paramTo="pmTo"
            initialFrom={fromDate}
            initialTo={toDate}
          />
          <ReportDownloadButton
            href={downloadHref}
            filename={`kinetic-metodos-pago-${fromDate}-a-${toDate}`}
          />
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant py-4">Sin datos en el rango seleccionado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fm-surface-container-high">
                <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Método
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Ciclos
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Total (USD)
                </th>
                <th className="text-right py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  % del total
                </th>
                <th className="py-2 pl-4 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.method}
                  className="border-b border-fm-surface-container-low hover:bg-fm-background transition-colors"
                >
                  <td className="py-3 pr-4 font-semibold text-fm-on-surface">
                    {formatPaymentMethodLabel(r.method)}
                  </td>
                  <td className="py-3 px-4 text-right text-fm-on-surface">{r.count}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface">
                    {formatUsd(r.totalUsd)}
                  </td>
                  <td className="py-3 px-4 text-right text-fm-on-surface">
                    {formatPercent(r.pct, 1)}
                  </td>
                  <td className="py-3 pl-4">
                    <div className="w-full bg-fm-surface-container dark:bg-fm-surface-container-high rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(1, r.pct * 100)}%`,
                          backgroundColor: '#00675c',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-fm-on-surface/40">
                <td className="py-3 pr-4 font-extrabold text-fm-on-surface">Total</td>
                <td className="py-3 px-4 text-right font-extrabold text-fm-on-surface">{totalCount}</td>
                <td
                  className="py-3 px-4 text-right text-lg font-black"
                  style={{ color: '#00675c' }}
                >
                  {formatUsd(totalUsd)}
                </td>
                <td className="py-3 px-4 text-right text-fm-on-surface-variant">100%</td>
                <td className="py-3 pl-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AccordionSection>
  )
}
