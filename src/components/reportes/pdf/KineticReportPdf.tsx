/* eslint-disable jsx-a11y/alt-text */
import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

export const KINETIC_TEAL = '#00675c'
export const KINETIC_RED = '#b31b25'
export const KINETIC_GRAY = '#595c5e'
export const BORDER = '#dfe3e6'
export const BG_SOFT = '#f5f7f9'

export const sharedStyles = StyleSheet.create({
  pageA4Portrait: { padding: 36, fontSize: 9, color: KINETIC_GRAY, fontFamily: 'Helvetica' },
  pageA4Landscape: { padding: 36, fontSize: 9, color: KINETIC_GRAY, fontFamily: 'Helvetica' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  logoBox: {
    width: 44,
    height: 44,
    backgroundColor: KINETIC_TEAL,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  logoText: { color: 'white', fontSize: 20, fontFamily: 'Helvetica-Bold' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandBlock: { marginLeft: 12 },
  brandName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: KINETIC_TEAL },
  brandTag: { fontSize: 8, color: KINETIC_GRAY, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  reportTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  reportSubtitle: { fontSize: 9, color: KINETIC_GRAY, marginTop: 2 },
  filtersLine: { fontSize: 8, color: KINETIC_GRAY, marginTop: 12, marginBottom: 4 },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 7,
    color: KINETIC_GRAY,
    borderTopWidth: 0.5,
    borderColor: BORDER,
    paddingTop: 6,
  },
  // Tabla genérica
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BG_SOFT,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  tableHeaderCell: {
    fontSize: 7,
    color: KINETIC_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
  },
  tableRowAlt: { backgroundColor: '#fafbfc' },
  cell: { fontSize: 9, color: '#1e293b' },
  cellBold: { fontSize: 9, color: '#1e293b', fontFamily: 'Helvetica-Bold' },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderColor: KINETIC_GRAY,
    marginTop: 4,
  },
  totalsLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  totalsValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: KINETIC_TEAL },
})

interface ShellHeaderProps {
  title: string
  subtitle?: string
  filtersLine?: string
  logoUrl?: string | null
}

export function ShellHeader({ title, subtitle, filtersLine, logoUrl }: ShellHeaderProps) {
  return (
    <>
      <View style={sharedStyles.headerRow}>
        <View style={sharedStyles.headerLeft}>
          {logoUrl ? (
            <Image src={logoUrl} style={{ width: 44, height: 44, objectFit: 'contain' }} />
          ) : (
            <View style={sharedStyles.logoBox}>
              <Text style={sharedStyles.logoText}>K</Text>
            </View>
          )}
          <View style={sharedStyles.brandBlock}>
            <Text style={sharedStyles.brandName}>Kinetic</Text>
            <Text style={sharedStyles.brandTag}>muévete y aprende</Text>
          </View>
        </View>
        <View style={sharedStyles.headerRight}>
          <Text style={sharedStyles.reportTitle}>{title}</Text>
          {subtitle && <Text style={sharedStyles.reportSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {filtersLine && <Text style={sharedStyles.filtersLine}>{filtersLine}</Text>}
    </>
  )
}

interface ShellFooterProps {
  generatedAtSV: string
}

export function ShellFooter({ generatedAtSV }: ShellFooterProps) {
  return (
    <Text
      style={sharedStyles.footer}
      render={({ pageNumber, totalPages }) =>
        `Generado el ${generatedAtSV} — Página ${pageNumber} de ${totalPages}`
      }
      fixed
    />
  )
}

/** Helper: timestamp legible en SV TZ para el footer. */
export function nowSvLabel(): string {
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: 'America/El_Salvador',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

// Re-export Page for convenience to avoid double imports in PDF components
export { Page }
