import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  BG_SOFT,
} from './KineticReportPdf'
import { formatUsd, type MonthlyRevenueRow } from '@/lib/domain/reports/financial'

interface Props {
  year: number
  rows: MonthlyRevenueRow[]
  logoUrl?: string | null
}

export function MonthlyRevenuePDF({ year, rows, logoUrl }: Props) {
  const totalRevenue = rows.reduce((s, r) => s + r.netRevenueUsd, 0)
  const totalGenerated = rows.reduce((s, r) => s + r.generatedCount, 0)
  const totalCancelled = rows.reduce((s, r) => s + r.cancelledCount, 0)

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title="Ingresos mensuales"
          subtitle={`Año ${year}`}
          filtersLine={`Período: enero–diciembre ${year} · Agrupado por fecha de pago (paid_at) en zona SV`}
          logoUrl={logoUrl}
        />

        <View style={[sharedStyles.tableHeader, { marginTop: 10 }]}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2 }]}>Mes</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Cobrados</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Cancelados</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Con descuento</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Niños únicos</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.3, textAlign: 'right' }]}>Ingreso (USD)</Text>
        </View>

        {rows.map((r, i) => (
          <View
            key={r.month}
            style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
          >
            <Text style={[sharedStyles.cell, { flex: 1.2 }]}>{r.monthLabel}</Text>
            <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.generatedCount}</Text>
            <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.cancelledCount}</Text>
            <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.discountAppliedCount}</Text>
            <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.uniqueChildrenPaid}</Text>
            <Text
              style={[
                sharedStyles.cellBold,
                { flex: 1.3, textAlign: 'right', color: r.netRevenueUsd > 0 ? KINETIC_TEAL : '#94a3b8' },
              ]}
            >
              {formatUsd(r.netRevenueUsd)}
            </Text>
          </View>
        ))}

        <View style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, { flex: 1.2 }]}>Total {year}</Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>{totalGenerated}</Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>{totalCancelled}</Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>—</Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>—</Text>
          <Text style={[sharedStyles.totalsValue, { flex: 1.3, textAlign: 'right' }]}>
            {formatUsd(totalRevenue)}
          </Text>
        </View>

        {/* Mini-barras de ingresos por mes */}
        <View style={{ marginTop: 24 }}>
          <Text
            style={{ fontSize: 8, color: '#1e293b', fontFamily: 'Helvetica-Bold', marginBottom: 8 }}
          >
            Distribución mensual
          </Text>
          {(() => {
            const max = Math.max(1, ...rows.map((r) => r.netRevenueUsd))
            return rows.map((r) => {
              const widthPct = (r.netRevenueUsd / max) * 100
              return (
                <View
                  key={r.month}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}
                >
                  <Text style={{ fontSize: 8, color: '#64748b', width: 32 }}>{r.monthShort}</Text>
                  <View
                    style={{
                      flex: 1,
                      height: 9,
                      backgroundColor: BG_SOFT,
                      borderRadius: 2,
                      marginRight: 8,
                    }}
                  >
                    <View
                      style={{
                        height: 9,
                        width: `${widthPct}%`,
                        backgroundColor: KINETIC_TEAL,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 8, color: '#1e293b', width: 72, textAlign: 'right' }}>
                    {formatUsd(r.netRevenueUsd)}
                  </Text>
                </View>
              )
            })
          })()}
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
