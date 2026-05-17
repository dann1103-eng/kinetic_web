import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  BG_SOFT,
} from './KineticReportPdf'
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
  logoUrl?: string | null
}

export function PaymentMethodPDF({ rows, totalUsd, totalCount, fromDate, toDate, logoUrl }: Props) {
  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title="Pagos por método"
          subtitle={`${fromDate} → ${toDate}`}
          filtersLine={`Excluye ciclos anulados. Agrupado por payment_method.`}
          logoUrl={logoUrl}
        />

        <View style={{ marginTop: 10, marginBottom: 12, flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              flex: 1,
              padding: 10,
              borderWidth: 0.5,
              borderColor: '#dfe3e6',
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total cobrado
            </Text>
            <Text
              style={{ fontSize: 20, color: KINETIC_TEAL, fontFamily: 'Helvetica-Bold', marginTop: 2 }}
            >
              {formatUsd(totalUsd)}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              padding: 10,
              borderWidth: 0.5,
              borderColor: '#dfe3e6',
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Ciclos cobrados
            </Text>
            <Text style={{ fontSize: 20, color: '#1e293b', fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
              {totalCount}
            </Text>
          </View>
        </View>

        <View style={sharedStyles.tableHeader}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 2 }]}>Método</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Ciclos</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.4, textAlign: 'right' }]}>Total (USD)</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>% del total</Text>
        </View>

        {rows.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin datos en el rango.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View key={r.method} style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}>
              <Text style={[sharedStyles.cellBold, { flex: 2 }]}>
                {formatPaymentMethodLabel(r.method)}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.count}</Text>
              <Text style={[sharedStyles.cellBold, { flex: 1.4, textAlign: 'right' }]}>
                {formatUsd(r.totalUsd)}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>
                {formatPercent(r.pct, 1)}
              </Text>
            </View>
          ))
        )}

        {/* Barras horizontales por método */}
        {rows.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text
              style={{ fontSize: 8, color: '#1e293b', fontFamily: 'Helvetica-Bold', marginBottom: 8 }}
            >
              Distribución visual
            </Text>
            {rows.map((r) => (
              <View
                key={`bar-${r.method}`}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}
              >
                <Text style={{ fontSize: 8, color: '#64748b', width: 90 }}>
                  {formatPaymentMethodLabel(r.method)}
                </Text>
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
                      width: `${Math.max(1, r.pct * 100)}%`,
                      backgroundColor: KINETIC_TEAL,
                      borderRadius: 2,
                    }}
                  />
                </View>
                <Text
                  style={{ fontSize: 8, color: '#1e293b', width: 60, textAlign: 'right' }}
                >
                  {formatPercent(r.pct, 1)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
