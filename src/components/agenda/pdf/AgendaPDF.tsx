import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from '@/components/reportes/pdf/KineticReportPdf'

export interface AgendaPdfRow {
  /** ISO date 'YYYY-MM-DD' (SV) — usado para agrupar. */
  dateKey: string
  dateLabel: string
  time: string
  childName: string
  therapistName: string
  serviceLabel: string
  modalityLabel: string
  statusLabel: string
  statusColor: string
}

interface Props {
  rows: AgendaPdfRow[]
  /** Texto del filtro de terapista (si aplica). */
  therapistFilterLabel?: string | null
  /** Rango de fechas legible (calculado del set de citas). */
  rangeLabel?: string | null
  /** Título alterno (ej. nombre del niño/a al exportar su calendario). */
  titleOverride?: string
  logoUrl?: string | null
}

export function AgendaPDF({ rows, therapistFilterLabel, rangeLabel, titleOverride, logoUrl }: Props) {
  // Agrupar por día (las filas llegan ya ordenadas por fecha+hora).
  const groups: { dateKey: string; dateLabel: string; rows: AgendaPdfRow[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.dateKey === r.dateKey) last.rows.push(r)
    else groups.push({ dateKey: r.dateKey, dateLabel: r.dateLabel, rows: [r] })
  }

  const filtersParts: string[] = []
  if (rangeLabel) filtersParts.push(rangeLabel)
  if (therapistFilterLabel) filtersParts.push(`Terapista: ${therapistFilterLabel}`)
  filtersParts.push(`${rows.length} cita${rows.length === 1 ? '' : 's'}`)
  filtersParts.push(`Generado ${nowSvLabel()}`)

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title={titleOverride ?? 'Agenda'}
          subtitle={titleOverride ? 'Calendario de citas' : 'Calendario del equipo'}
          filtersLine={filtersParts.join(' · ')}
          logoUrl={logoUrl}
        />

        {groups.length === 0 ? (
          <Text style={{ fontSize: 10, color: KINETIC_RED, marginTop: 12 }}>
            No hay citas que mostrar con los filtros seleccionados.
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.dateKey} style={{ marginBottom: 12 }} wrap={false}>
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: 'Helvetica-Bold',
                  color: KINETIC_TEAL,
                  marginBottom: 4,
                  textTransform: 'capitalize',
                }}
              >
                {g.dateLabel}
              </Text>

              <View style={sharedStyles.tableHeader}>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 1.1 }]}>Hora</Text>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 2 }]}>Niño/a</Text>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 1.6 }]}>Terapista</Text>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 1.6 }]}>Servicio</Text>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 1 }]}>Modalidad</Text>
                <Text style={[sharedStyles.tableHeaderCell, { flex: 1.1 }]}>Estado</Text>
              </View>

              {g.rows.map((r, i) => (
                <View
                  key={`${g.dateKey}-${i}`}
                  style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
                >
                  <Text style={[sharedStyles.cellBold, { flex: 1.1 }]}>{r.time}</Text>
                  <Text style={[sharedStyles.cellBold, { flex: 2 }]}>{r.childName}</Text>
                  <Text style={[sharedStyles.cell, { flex: 1.6 }]}>{r.therapistName}</Text>
                  <Text style={[sharedStyles.cell, { flex: 1.6 }]}>{r.serviceLabel}</Text>
                  <Text style={[sharedStyles.cell, { flex: 1 }]}>{r.modalityLabel}</Text>
                  <Text style={[sharedStyles.cellBold, { flex: 1.1, color: r.statusColor }]}>
                    {r.statusLabel}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
