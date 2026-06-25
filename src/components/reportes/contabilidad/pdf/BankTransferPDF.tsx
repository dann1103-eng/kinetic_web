import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
} from '@/components/reportes/pdf/KineticReportPdf'
import type { BankTransferRow, BankTransferTotals } from '@/lib/domain/reports/bank-transfer'

interface Props {
  rows: BankTransferRow[]
  totals: BankTransferTotals
  monthLabel: string
  logoUrl?: string | null
}

const COL = {
  idx: 0.5,
  nombre: 3,
  duiNit: 2.4,
  banco: 2,
  tipo: 1.3,
  cuenta: 2.3,
  salario: 1.4,
  honorarios: 1.6,
  otros: 1.1,
  total: 1.5,
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

const HEAD = { fontFamily: 'Helvetica-Bold', fontSize: 7, color: '#1e293b' } as const
const CELL = { fontSize: 7.5, color: '#1e293b' } as const

export function BankTransferPDF({ rows, totals, monthLabel, logoUrl }: Props) {
  const labelFlex = COL.idx + COL.nombre + COL.duiNit + COL.banco + COL.tipo + COL.cuenta

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.pageA4Landscape}>
        <ShellHeader
          title="Planilla de números de cuenta — transferencias"
          subtitle={monthLabel}
          filtersLine={`Generado ${nowSvLabel()}`}
          logoUrl={logoUrl}
        />

        {/* Cabecera de tabla */}
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderColor: '#1e293b',
            paddingBottom: 4,
            marginTop: 8,
          }}
        >
          <Text style={{ flex: COL.idx, ...HEAD }}>#</Text>
          <Text style={{ flex: COL.nombre, ...HEAD }}>NOMBRE</Text>
          <Text style={{ flex: COL.duiNit, ...HEAD }}>DUI / NIT</Text>
          <Text style={{ flex: COL.banco, ...HEAD }}>BANCO</Text>
          <Text style={{ flex: COL.tipo, ...HEAD }}>TIPO</Text>
          <Text style={{ flex: COL.cuenta, ...HEAD }}>Nº CUENTA</Text>
          <Text style={{ flex: COL.salario, textAlign: 'right', ...HEAD }}>SALARIO</Text>
          <Text style={{ flex: COL.honorarios, textAlign: 'right', ...HEAD }}>HONORARIOS</Text>
          <Text style={{ flex: COL.otros, textAlign: 'right', ...HEAD }}>OTROS</Text>
          <Text style={{ flex: COL.total, textAlign: 'right', ...HEAD }}>TOTAL</Text>
        </View>

        {/* Filas */}
        {rows.map((r, i) => (
          <View
            key={r.userId}
            style={{
              flexDirection: 'row',
              paddingVertical: 3,
              borderBottomWidth: 0.5,
              borderColor: '#e2e8f0',
              backgroundColor: i % 2 === 1 ? '#f8fafc' : '#ffffff',
            }}
          >
            <Text style={{ flex: COL.idx, ...CELL, color: '#64748b' }}>{i + 1}</Text>
            <Text style={{ flex: COL.nombre, ...CELL, fontFamily: 'Helvetica-Bold' }}>{r.nombre}</Text>
            <Text style={{ flex: COL.duiNit, ...CELL }}>{r.duiNit || '—'}</Text>
            <Text style={{ flex: COL.banco, ...CELL, color: r.banco ? '#1e293b' : '#b31b25' }}>
              {r.banco || 'Falta'}
            </Text>
            <Text style={{ flex: COL.tipo, ...CELL }}>{r.tipoCuenta || '—'}</Text>
            <Text style={{ flex: COL.cuenta, ...CELL, color: r.numeroCuenta ? '#1e293b' : '#b31b25' }}>
              {r.numeroCuenta || 'Falta'}
            </Text>
            <Text style={{ flex: COL.salario, textAlign: 'right', ...CELL }}>
              {r.salario ? money(r.salario) : '—'}
            </Text>
            <Text style={{ flex: COL.honorarios, textAlign: 'right', ...CELL }}>
              {r.honorarios ? money(r.honorarios) : '—'}
            </Text>
            <Text style={{ flex: COL.otros, textAlign: 'right', ...CELL }}>
              {r.otros ? money(r.otros) : '—'}
            </Text>
            <Text style={{ flex: COL.total, textAlign: 'right', ...CELL, fontFamily: 'Helvetica-Bold' }}>
              {money(r.total)}
            </Text>
          </View>
        ))}

        {/* Totales */}
        <View
          style={{
            flexDirection: 'row',
            paddingVertical: 5,
            borderTopWidth: 1.5,
            borderColor: '#1e293b',
            marginTop: 2,
          }}
        >
          <Text style={{ flex: labelFlex, fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#1e293b' }}>
            TOTAL A TRANSFERIR
          </Text>
          <Text style={{ flex: COL.salario, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
            {money(totals.salario)}
          </Text>
          <Text style={{ flex: COL.honorarios, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
            {money(totals.honorarios)}
          </Text>
          <Text style={{ flex: COL.otros, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
            {money(totals.otros)}
          </Text>
          <Text style={{ flex: COL.total, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 9, color: KINETIC_TEAL }}>
            {money(totals.total)}
          </Text>
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
