import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from './KineticReportPdf'
import { formatPercent, type ChurnBreakdown } from '@/lib/domain/reports/financial'

interface Props {
  data: ChurnBreakdown
  fromDate: string
  toDate: string
  logoUrl?: string | null
}

export function ChurnPDF({ data, fromDate, toDate, logoUrl }: Props) {
  const { rows, totals, abandonRatePct } = data

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title="Churn de familias"
          subtitle={`${fromDate} → ${toDate}`}
          filtersLine="Basado en cambios de treatment_status. Altas médicas = salidas positivas. Bajas = abandonos."
          logoUrl={logoUrl}
        />

        {/* Resumen */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            marginTop: 6,
            marginBottom: 14,
          }}
        >
          <KpiBox label="Altas nuevas" value={String(totals.newActives)} accent={KINETIC_TEAL} />
          <KpiBox label="Alta médica" value={String(totals.medicalDischarges)} accent="#0369a1" />
          <KpiBox label="Bajas" value={String(totals.dropouts)} accent={KINETIC_RED} />
          <KpiBox label="Pausas" value={String(totals.paused)} accent="#b45309" />
          <KpiBox
            label="Tasa abandono"
            value={formatPercent(abandonRatePct / 100, 1)}
            accent={abandonRatePct > 30 ? KINETIC_RED : abandonRatePct > 15 ? '#b45309' : KINETIC_TEAL}
          />
        </View>

        {/* Net change destacado */}
        <View
          style={{
            marginBottom: 14,
            padding: 10,
            borderWidth: 0.5,
            borderColor: '#dfe3e6',
            borderRadius: 4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 9, color: '#64748b' }}>Crecimiento neto del período</Text>
          <Text
            style={{
              fontSize: 22,
              fontFamily: 'Helvetica-Bold',
              color: totals.netChange > 0 ? KINETIC_TEAL : totals.netChange < 0 ? KINETIC_RED : '#64748b',
            }}
          >
            {totals.netChange >= 0 ? '+' : ''}{totals.netChange} niños
          </Text>
        </View>

        <Text
          style={{
            fontSize: 8,
            color: '#1e293b',
            fontFamily: 'Helvetica-Bold',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Detalle mensual
        </Text>

        <View style={sharedStyles.tableHeader}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.5 }]}>Mes</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Altas</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Alta médica</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Bajas</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Pausas</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Neto</Text>
        </View>

        {rows.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin cambios de estado en el rango.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.month}
              style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
            >
              <Text style={[sharedStyles.cell, { flex: 1.5 }]}>{r.monthLabel}</Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: KINETIC_TEAL }]}>
                +{r.newActives}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#0369a1' }]}>
                {r.medicalDischarges > 0 ? `−${r.medicalDischarges}` : '—'}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: KINETIC_RED }]}>
                {r.dropouts > 0 ? `−${r.dropouts}` : '—'}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#b45309' }]}>
                {r.paused > 0 ? r.paused : '—'}
              </Text>
              <Text
                style={[
                  sharedStyles.cellBold,
                  {
                    flex: 1,
                    textAlign: 'right',
                    color: r.netChange > 0 ? KINETIC_TEAL : r.netChange < 0 ? KINETIC_RED : '#64748b',
                  },
                ]}
              >
                {r.netChange >= 0 ? '+' : ''}{r.netChange}
              </Text>
            </View>
          ))
        )}

        <View style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, { flex: 1.5 }]}>Total período</Text>
          <Text style={[sharedStyles.totalsValue, { flex: 1, textAlign: 'right' }]}>
            +{totals.newActives}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#0369a1' }]}>
            −{totals.medicalDischarges}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: KINETIC_RED }]}>
            −{totals.dropouts}
          </Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#b45309' }]}>
            {totals.paused}
          </Text>
          <Text
            style={[
              sharedStyles.totalsValue,
              {
                flex: 1,
                textAlign: 'right',
                color: totals.netChange > 0 ? KINETIC_TEAL : totals.netChange < 0 ? KINETIC_RED : '#64748b',
              },
            ]}
          >
            {totals.netChange >= 0 ? '+' : ''}{totals.netChange}
          </Text>
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}

function KpiBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 8,
        borderWidth: 0.5,
        borderColor: '#dfe3e6',
        borderRadius: 4,
      }}
    >
      <Text
        style={{ fontSize: 6.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16, color: accent, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  )
}
