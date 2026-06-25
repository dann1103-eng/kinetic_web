import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
} from '@/components/reportes/pdf/KineticReportPdf'
import { fmtUsd, formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import { CONTRACT_TYPE_LABELS, AFP_PROVIDER_LABELS } from '@/types/db'
import type { PayrollItem, PayrollRun } from '@/types/db'

interface ItemWithUser extends PayrollItem {
  user: { id: string; full_name: string; email: string; role: string } | null
}

interface Props {
  run: PayrollRun
  item: ItemWithUser
  logoUrl?: string | null
}

export function PayrollItemPDF({ run, item, logoUrl }: Props) {
  const period = formatPeriodLabel(run.period_year, run.period_month, run.period_half)
  const isSp = run.payroll_type === 'servicios_profesionales'
  const snap = item.user_snapshot_json
  const name = snap?.full_name ?? item.user?.full_name ?? '—'
  const role = (snap?.role ?? item.user?.role ?? '').replace('_', ' ')

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title={isSp ? 'Recibo de servicios profesionales' : 'Recibo de salario'}
          subtitle={period}
          filtersLine={`Estado de planilla: ${run.status} · Generado ${nowSvLabel()}`}
          logoUrl={logoUrl}
        />

        {/* Datos del empleado */}
        <View
          style={{
            marginTop: 8,
            marginBottom: 12,
            padding: 10,
            borderWidth: 0.5,
            borderColor: '#dfe3e6',
            borderRadius: 4,
          }}
        >
          <Text style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Empleado
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e293b', marginTop: 2 }}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Rol: {role}</Text>
            {snap?.contract_type && (
              <Text style={{ fontSize: 8, color: '#64748b' }}>
                Contrato: {CONTRACT_TYPE_LABELS[snap.contract_type]}
              </Text>
            )}
            {snap?.dui && <Text style={{ fontSize: 8, color: '#64748b' }}>DUI: {snap.dui}</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
            {snap?.isss_number && <Text style={{ fontSize: 8, color: '#64748b' }}>ISSS: {snap.isss_number}</Text>}
            {snap?.afp_number && (
              <Text style={{ fontSize: 8, color: '#64748b' }}>
                AFP: {snap.afp_number}
                {snap?.afp_provider ? ` (${AFP_PROVIDER_LABELS[snap.afp_provider]})` : ''}
              </Text>
            )}
            {snap?.hire_date && <Text style={{ fontSize: 8, color: '#64748b' }}>Contratación: {snap.hire_date}</Text>}
          </View>
        </View>

        {/* Cálculo */}
        <View style={[sharedStyles.tableHeader, { marginBottom: 0 }]}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 2 }]}>Concepto</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Monto (USD)</Text>
        </View>

        <Row label={isSp ? 'Honorarios profesionales' : 'Salario base'} value={fmtUsd(Number(item.base_salary_usd))} />
        {!isSp && Number(item.extra_hours_amount_usd) > 0 && (
          <Row
            label={`Horas extras (${item.extra_hours} h × ${fmtUsd(Number(item.extra_hours_rate_usd ?? 0))})`}
            value={fmtUsd(Number(item.extra_hours_amount_usd))}
          />
        )}
        {Number(item.bonus_usd) > 0 && (
          <Row label={isSp ? 'Bonos / otros ingresos' : 'Bono / pago extra'} value={fmtUsd(Number(item.bonus_usd))} />
        )}
        <Row label={isSp ? 'Honorarios brutos' : 'Bruto'} value={fmtUsd(Number(item.gross_total_usd))} bold tone="dark" />

        {!isSp && (
          <>
            <Row label="ISSS empleado (3%)" value={`−${fmtUsd(Number(item.isss_employee_usd))}`} tone="red" />
            <Row label="AFP empleado (7.25%)" value={`−${fmtUsd(Number(item.afp_employee_usd))}`} tone="red" />
          </>
        )}
        <Row label={isSp ? 'Retención ISR' : 'ISR'} value={`−${fmtUsd(Number(item.isr_usd))}`} tone="red" />
        {Number(item.other_deductions_usd) > 0 && (
          <Row label="Otras deducciones" value={`−${fmtUsd(Number(item.other_deductions_usd))}`} tone="red" />
        )}
        <Row
          label="Total deducciones"
          value={`−${fmtUsd(Number(item.total_deductions_usd))}`}
          bold
          tone="red"
        />

        {/* Total neto */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1.5,
            borderColor: '#1e293b',
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1e293b' }}>
            Neto a pagar
          </Text>
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: KINETIC_TEAL }}>
            {fmtUsd(Number(item.net_pay_usd))}
          </Text>
        </View>

        {/* Notas */}
        {item.notes && (
          <View style={{ marginTop: 16, padding: 8, borderWidth: 0.5, borderColor: '#dfe3e6', borderRadius: 4 }}>
            <Text style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Notas
            </Text>
            <Text style={{ fontSize: 9, color: '#1e293b', marginTop: 4, lineHeight: 1.4 }}>
              {item.notes}
            </Text>
          </View>
        )}

        {/* Firma */}
        <View
          style={{
            marginTop: 32,
            paddingTop: 24,
            borderTopWidth: 0.5,
            borderColor: '#dfe3e6',
          }}
        >
          {item.signed_at ? (
            <View
              style={{
                padding: 10,
                backgroundColor: '#ecfdf5',
                borderWidth: 0.5,
                borderColor: '#10b981',
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#065f46' }}>
                ✓ Recibido y conforme
              </Text>
              <Text style={{ fontSize: 8, color: '#065f46', marginTop: 2 }}>
                Firmado digitalmente el {new Date(item.signed_at).toLocaleString('es-SV')}
                {item.signed_ip && ` desde ${item.signed_ip}`}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ flex: 1 }}>
                <View
                  style={{ height: 40, borderBottomWidth: 0.5, borderColor: '#94a3b8' }}
                />
                <Text style={{ fontSize: 7, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                  Firma del empleado
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{ height: 40, borderBottomWidth: 0.5, borderColor: '#94a3b8' }}
                />
                <Text style={{ fontSize: 7, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                  Fecha
                </Text>
              </View>
            </View>
          )}
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}

function Row({ label, value, bold, tone }: {
  label: string
  value: string
  bold?: boolean
  tone?: 'red' | 'dark'
}) {
  const color = tone === 'red' ? '#b31b25' : '#1e293b'
  return (
    <View style={sharedStyles.tableRow}>
      <Text style={[bold ? sharedStyles.cellBold : sharedStyles.cell, { flex: 2, color }]}>
        {label}
      </Text>
      <Text style={[bold ? sharedStyles.cellBold : sharedStyles.cell, { flex: 1, textAlign: 'right', color }]}>
        {value}
      </Text>
    </View>
  )
}
