import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from './KineticReportPdf'
import { formatPercent, type CycleStatusBreakdown } from '@/lib/domain/reports/financial'

interface Props {
  data: CycleStatusBreakdown
  fromDate: string
  toDate: string
  logoUrl?: string | null
}

export function CycleStatusPDF({ data, fromDate, toDate, logoUrl }: Props) {
  const { rows, totals, topReasons } = data

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title="Ciclos generados vs cancelados"
          subtitle={`${fromDate} → ${toDate}`}
          filtersLine={`Rango por fecha de pago (paid_at). Cancelados se cuentan aparte del total cobrado.`}
          logoUrl={logoUrl}
        />

        {/* Resumen */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1, padding: 8, borderWidth: 0.5, borderColor: '#dfe3e6', borderRadius: 4 }}>
            <Text
              style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Cobrados
            </Text>
            <Text style={{ fontSize: 18, color: KINETIC_TEAL, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
              {totals.generated}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 8, borderWidth: 0.5, borderColor: '#dfe3e6', borderRadius: 4 }}>
            <Text
              style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Cancelados
            </Text>
            <Text style={{ fontSize: 18, color: KINETIC_RED, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
              {totals.cancelled}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 8, borderWidth: 0.5, borderColor: '#dfe3e6', borderRadius: 4 }}>
            <Text
              style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Tasa cancelación
            </Text>
            <Text style={{ fontSize: 18, color: '#1e293b', fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
              {formatPercent(totals.cancellationRate, 1)}
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontSize: 8,
            color: '#1e293b',
            fontFamily: 'Helvetica-Bold',
            marginBottom: 6,
            marginTop: 4,
          }}
        >
          Detalle por mes
        </Text>

        <View style={sharedStyles.tableHeader}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2 }]}>Mes</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Cobrados</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Cancelados</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Total</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>
            Tasa cancelación
          </Text>
        </View>

        {rows.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin datos en el rango.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.month}
              style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
            >
              <Text style={[sharedStyles.cell, { flex: 1.2 }]}>{r.monthLabel}</Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: KINETIC_TEAL }]}>
                {r.generatedCount}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: KINETIC_RED }]}>
                {r.cancelledCount}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>{r.totalCount}</Text>
              <Text style={[sharedStyles.cell, { flex: 1.2, textAlign: 'right' }]}>
                {formatPercent(r.cancellationRate, 1)}
              </Text>
            </View>
          ))
        )}

        {/* Top motivos */}
        {topReasons.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Text
              style={{
                fontSize: 8,
                color: '#1e293b',
                fontFamily: 'Helvetica-Bold',
                marginBottom: 6,
              }}
            >
              Top motivos de cancelación
            </Text>
            {topReasons.map((tr, i) => (
              <View
                key={`${tr.reason}-${i}`}
                style={{
                  flexDirection: 'row',
                  paddingVertical: 4,
                  borderBottomWidth: 0.5,
                  borderColor: '#dfe3e6',
                }}
              >
                <Text style={{ fontSize: 9, color: '#1e293b', flex: 1 }}>
                  {i + 1}. {tr.reason}
                </Text>
                <Text
                  style={{ fontSize: 9, color: KINETIC_RED, fontFamily: 'Helvetica-Bold', width: 40, textAlign: 'right' }}
                >
                  {tr.count}
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
