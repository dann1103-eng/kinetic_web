import { AccordionSection } from '@/components/ui/AccordionSection'
import { DateRangeFilter } from './DateRangeFilter'
import { ReportDownloadButton } from './ReportDownloadButton'
import { formatPercent, type ChurnBreakdown } from '@/lib/domain/reports/financial'

interface Props {
  data: ChurnBreakdown
  fromDate: string
  toDate: string
}

export function ChurnSection({ data, fromDate, toDate }: Props) {
  const { rows, totals, abandonRatePct } = data
  const downloadHref = `/api/reportes/financieros/churn?from=${fromDate}&to=${toDate}`

  return (
    <AccordionSection
      title="Churn de familias"
      subtitle={`Altas: ${totals.newActives} · Salidas: ${totals.medicalDischarges + totals.dropouts} · Neto: ${totals.netChange >= 0 ? '+' : ''}${totals.netChange}`}
      headerRight={
        <div className="flex items-center gap-3">
          <DateRangeFilter
            paramFrom="churnFrom"
            paramTo="churnTo"
            initialFrom={fromDate}
            initialTo={toDate}
          />
          <ReportDownloadButton
            href={downloadHref}
            filename={`kinetic-churn-${fromDate}-a-${toDate}`}
          />
        </div>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Altas nuevas" value={String(totals.newActives)} accent="#00675c" />
        <Kpi label="Altas médicas" value={String(totals.medicalDischarges)} accent="#0369a1" />
        <Kpi label="Bajas / abandonos" value={String(totals.dropouts)} accent="#b31b25" />
        <Kpi label="Pausas / en riesgo" value={String(totals.paused)} accent="#b45309" />
        <Kpi
          label="Tasa de abandono"
          value={formatPercent(abandonRatePct / 100, 1)}
          accent={abandonRatePct > 30 ? '#b31b25' : abandonRatePct > 15 ? '#b45309' : '#00675c'}
          hint="bajas / total salidas"
        />
      </div>

      {/* Tabla mensual */}
      <h3 className="text-sm font-extrabold text-fm-on-surface mb-2">Detalle mensual</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant py-4">
          Sin cambios de estado en el rango. Si recién migraste a Kinetic puede no haber histórico aún.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fm-surface-container-high">
                <th className="text-left py-2 pr-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Mes
                </th>
                <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Altas
                </th>
                <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Alta médica
                </th>
                <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Bajas
                </th>
                <th className="text-right py-2 px-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Pausas
                </th>
                <th className="text-right py-2 pl-3 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">
                  Neto
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.month}
                  className="border-b border-fm-surface-container-low hover:bg-fm-background"
                >
                  <td className="py-3 pr-4 font-semibold text-fm-on-surface">{r.monthLabel}</td>
                  <td className="py-3 px-3 text-right font-bold" style={{ color: '#00675c' }}>
                    +{r.newActives}
                  </td>
                  <td className="py-3 px-3 text-right" style={{ color: '#0369a1' }}>
                    {r.medicalDischarges > 0 ? `−${r.medicalDischarges}` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-bold" style={{ color: '#b31b25' }}>
                    {r.dropouts > 0 ? `−${r.dropouts}` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right" style={{ color: '#b45309' }}>
                    {r.paused > 0 ? r.paused : '—'}
                  </td>
                  <td
                    className="py-3 pl-3 text-right font-extrabold"
                    style={{ color: r.netChange > 0 ? '#00675c' : r.netChange < 0 ? '#b31b25' : '#64748b' }}
                  >
                    {r.netChange >= 0 ? '+' : ''}{r.netChange}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-fm-on-surface/40">
                <td className="py-3 pr-4 font-extrabold text-fm-on-surface">Total período</td>
                <td className="py-3 px-3 text-right font-extrabold" style={{ color: '#00675c' }}>
                  +{totals.newActives}
                </td>
                <td className="py-3 px-3 text-right font-bold" style={{ color: '#0369a1' }}>
                  −{totals.medicalDischarges}
                </td>
                <td className="py-3 px-3 text-right font-extrabold" style={{ color: '#b31b25' }}>
                  −{totals.dropouts}
                </td>
                <td className="py-3 px-3 text-right" style={{ color: '#b45309' }}>
                  {totals.paused}
                </td>
                <td
                  className="py-3 pl-3 text-right text-lg font-black"
                  style={{ color: totals.netChange > 0 ? '#00675c' : totals.netChange < 0 ? '#b31b25' : '#64748b' }}
                >
                  {totals.netChange >= 0 ? '+' : ''}{totals.netChange}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-fm-on-surface-variant mt-4 italic">
        Basado en cambios de <code>treatment_status</code> de los niños. Altas médicas (alta condicional + final) son
        salidas positivas. Bajas son abandonos. Tasa de abandono = bajas / (bajas + altas médicas).
      </p>
    </AccordionSection>
  )
}

function Kpi({ label, value, accent, hint }: { label: string; value: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-fm-background border border-fm-surface-container-high p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </p>
      <p className="text-2xl font-black mt-2" style={{ color: accent }}>
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-fm-on-surface-variant mt-1 italic">{hint}</p>
      )}
    </div>
  )
}
