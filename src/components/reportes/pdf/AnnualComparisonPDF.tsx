import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from './KineticReportPdf'
import { formatUsd, type AnnualComparisonRow } from '@/lib/domain/reports/financial'

interface Props {
  data: {
    rows: AnnualComparisonRow[]
    currentYear: number
    previousYear: number
    totals: { current: number; previous: number; deltaUsd: number; deltaPct: number | null }
  }
  logoUrl?: string | null
}

export function AnnualComparisonPDF({ data, logoUrl }: Props) {
  const { rows, currentYear, previousYear, totals } = data

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.pageA4Landscape}>
        <ShellHeader
          title="Comparativa anual"
          subtitle={`${currentYear} vs ${previousYear}`}
          filtersLine={`Período: enero–diciembre · Excluye ciclos anulados · Agrupado por paid_at en zona SV`}
          logoUrl={logoUrl}
        />

        <View style={[sharedStyles.tableHeader, { marginTop: 10 }]}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 0.8 }]}>Mes</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>
            Ciclos {previousYear}
          </Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>
            Ingreso {previousYear}
          </Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>
            Ciclos {currentYear}
          </Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>
            Ingreso {currentYear}
          </Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Δ USD</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Δ %</Text>
        </View>

        {rows.map((r, i) => {
          const deltaColor = r.deltaUsd > 0 ? KINETIC_TEAL : r.deltaUsd < 0 ? KINETIC_RED : '#64748b'
          return (
            <View
              key={r.month}
              style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
            >
              <Text style={[sharedStyles.cell, { flex: 0.8 }]}>{r.monthShort}</Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>
                {r.previousYearCycles}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1.2, textAlign: 'right' }]}>
                {formatUsd(r.previousYearRevenue)}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>
                {r.currentYearCycles}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 1.2, textAlign: 'right' }]}>
                {formatUsd(r.currentYearRevenue)}
              </Text>
              <Text
                style={[sharedStyles.cellBold, { flex: 1.2, textAlign: 'right', color: deltaColor }]}
              >
                {r.deltaUsd >= 0 ? '+' : ''}
                {formatUsd(r.deltaUsd)}
              </Text>
              <Text
                style={[sharedStyles.cell, { flex: 0.8, textAlign: 'right', color: deltaColor }]}
              >
                {r.deltaPct === null
                  ? '—'
                  : `${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%`}
              </Text>
            </View>
          )
        })}

        <View style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, { flex: 0.8 }]}>Total</Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>—</Text>
          <Text style={[sharedStyles.cellBold, { flex: 1.2, textAlign: 'right' }]}>
            {formatUsd(totals.previous)}
          </Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>—</Text>
          <Text style={[sharedStyles.totalsValue, { flex: 1.2, textAlign: 'right' }]}>
            {formatUsd(totals.current)}
          </Text>
          <Text
            style={[
              sharedStyles.totalsValue,
              {
                flex: 1.2,
                textAlign: 'right',
                color: totals.deltaUsd >= 0 ? KINETIC_TEAL : KINETIC_RED,
              },
            ]}
          >
            {totals.deltaUsd >= 0 ? '+' : ''}
            {formatUsd(totals.deltaUsd)}
          </Text>
          <Text
            style={[
              sharedStyles.cellBold,
              {
                flex: 0.8,
                textAlign: 'right',
                color: totals.deltaUsd >= 0 ? KINETIC_TEAL : KINETIC_RED,
              },
            ]}
          >
            {totals.deltaPct === null
              ? '—'
              : `${totals.deltaPct >= 0 ? '+' : ''}${totals.deltaPct.toFixed(1)}%`}
          </Text>
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
