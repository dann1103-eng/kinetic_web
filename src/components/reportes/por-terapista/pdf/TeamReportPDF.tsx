import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from '@/components/reportes/pdf/KineticReportPdf'
import { fmtHours, fmtPercent, type TherapistMonthlyReport } from '@/lib/domain/reports/therapist'

interface Props {
  report: TherapistMonthlyReport
  logoUrl?: string | null
}

export function TeamReportPDF({ report, logoUrl }: Props) {
  const { rows, totals, monthLabel } = report

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.pageA4Landscape}>
        <ShellHeader
          title="Reporte mensual por terapista"
          subtitle={monthLabel}
          filtersLine={`${totals.therapists} terapistas · ${totals.completed} sesiones completadas · ${fmtHours(totals.hoursWorked)} trabajadas`}
          logoUrl={logoUrl}
        />

        {/* Header de doble fila */}
        <View
          style={[
            sharedStyles.tableHeader,
            { marginTop: 10, flexDirection: 'column', alignItems: 'stretch', paddingVertical: 0 },
          ]}
        >
          <View style={{ flexDirection: 'row' }}>
            <Text style={[sharedStyles.tableHeaderCell, { flex: 2.2, paddingVertical: 6 }]}>
              Terapista
            </Text>
            <Text
              style={[
                sharedStyles.tableHeaderCell,
                { flex: 3, textAlign: 'center', paddingVertical: 6, borderLeftWidth: 0.5, borderColor: '#cbd5e1' },
              ]}
            >
              Asistencia
            </Text>
            <Text
              style={[
                sharedStyles.tableHeaderCell,
                { flex: 2, textAlign: 'center', paddingVertical: 6, borderLeftWidth: 0.5, borderColor: '#cbd5e1' },
              ]}
            >
              Carga horaria
            </Text>
            <Text
              style={[
                sharedStyles.tableHeaderCell,
                { flex: 2.5, textAlign: 'center', paddingVertical: 6, borderLeftWidth: 0.5, borderColor: '#cbd5e1' },
              ]}
            >
              Informes
            </Text>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderColor: '#cbd5e1' }}>
            <Text style={{ flex: 2.2 }}></Text>
            <Text style={[subHeader, { flex: 0.75, borderLeftWidth: 0.5, borderColor: '#cbd5e1' }]}>Compl.</Text>
            <Text style={[subHeader, { flex: 0.75 }]}>NoShow</Text>
            <Text style={[subHeader, { flex: 0.75 }]}>L.Cancel</Text>
            <Text style={[subHeader, { flex: 0.75 }]}>Reposic.</Text>
            <Text style={[subHeader, { flex: 1, borderLeftWidth: 0.5, borderColor: '#cbd5e1' }]}>Trabaj.</Text>
            <Text style={[subHeader, { flex: 1 }]}>% Ocup.</Text>
            <Text style={[subHeader, { flex: 0.8, borderLeftWidth: 0.5, borderColor: '#cbd5e1' }]}>Niños</Text>
            <Text style={[subHeader, { flex: 0.8 }]}>Entreg.</Text>
            <Text style={[subHeader, { flex: 0.9 }]}>% Cumpl.</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin terapistas activos.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.therapist.id}
              style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
            >
              <View style={{ flex: 2.2 }}>
                <Text style={sharedStyles.cellBold}>{r.therapist.full_name}</Text>
                <Text style={{ fontSize: 7, color: '#64748b' }}>
                  {r.therapist.role.replace('_', ' ')}
                </Text>
              </View>
              <Text style={[sharedStyles.cellBold, { flex: 0.75, textAlign: 'right' }]}>
                {r.attendance.completed}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 0.75, textAlign: 'right', color: KINETIC_RED }]}>
                {r.attendance.no_show}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 0.75, textAlign: 'right', color: '#b45309' }]}>
                {r.attendance.late_cancel}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 0.75, textAlign: 'right', color: KINETIC_TEAL }]}>
                {r.attendance.replacement_attended}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>
                {fmtHours(r.hoursLoad.hoursWorked)}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: occupancyColor(r.hoursLoad.occupancyPct) }]}>
                {r.hoursLoad.occupancyPct == null ? '—' : fmtPercent(r.hoursLoad.occupancyPct, 0)}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 0.8, textAlign: 'right' }]}>
                {r.reports.childrenAsPrimary}
              </Text>
              <Text style={[sharedStyles.cell, { flex: 0.8, textAlign: 'right' }]}>
                {r.reports.reportsDelivered}/{r.reports.reportsDue}
              </Text>
              <Text style={[sharedStyles.cellBold, { flex: 0.9, textAlign: 'right', color: complianceColor(r.reports.compliancePct, r.reports.reportsDue) }]}>
                {r.reports.reportsDue === 0 ? '—' : fmtPercent(r.reports.compliancePct, 0)}
              </Text>
            </View>
          ))
        )}

        {/* Totales */}
        <View style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, { flex: 2.2 }]}>Totales</Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.75, textAlign: 'right' }]}>{totals.completed}</Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.75, textAlign: 'right', color: KINETIC_RED }]}>
            {totals.no_show}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.75, textAlign: 'right', color: '#b45309' }]}>
            {totals.late_cancel}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.75, textAlign: 'right', color: KINETIC_TEAL }]}>
            {totals.replacement_attended}
          </Text>
          <Text style={[sharedStyles.totalsValue, { flex: 1, textAlign: 'right' }]}>
            {fmtHours(totals.hoursWorked)}
          </Text>
          <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>—</Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.8, textAlign: 'right' }]}>{totals.childrenAsPrimary}</Text>
          <Text style={[sharedStyles.cellBold, { flex: 0.8, textAlign: 'right' }]}>
            {totals.reportsDelivered}/{totals.reportsDue}
          </Text>
          <Text style={[sharedStyles.cell, { flex: 0.9, textAlign: 'right' }]}>—</Text>
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}

const subHeader = {
  fontSize: 6.5,
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.3,
  fontFamily: 'Helvetica-Bold',
  textAlign: 'right' as const,
  paddingVertical: 4,
  paddingHorizontal: 3,
}

function occupancyColor(pct: number | null): string {
  if (pct == null) return '#64748b'
  if (pct < 60) return '#047857'
  if (pct <= 85) return '#b45309'
  return KINETIC_RED
}

function complianceColor(pct: number, due: number): string {
  if (due === 0) return '#64748b'
  if (pct >= 90) return '#047857'
  if (pct >= 70) return '#b45309'
  return KINETIC_RED
}
