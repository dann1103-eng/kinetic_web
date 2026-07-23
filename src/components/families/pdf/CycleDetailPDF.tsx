import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { CycleDetailData } from '@/lib/domain/billing/cycle-detail'

const TEAL = '#00675c'
const RED = '#b31b25'
const GRAY = '#595c5e'
const LIGHT = '#eef3f2'
const BORDER = '#c9d2d0'

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 28, fontSize: 9, color: '#1c2935', fontFamily: 'Helvetica' },
  headerBar: { backgroundColor: TEAL, paddingVertical: 6, borderRadius: 3, alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  childName: { textAlign: 'center', fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 12 },

  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  sectionBar: { backgroundColor: TEAL, paddingVertical: 3, paddingHorizontal: 6, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  sectionBarRed: { backgroundColor: RED },
  sectionTitle: { color: '#ffffff', fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 0.5 },

  // Calendario
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  calHeadRow: { flexDirection: 'row' },
  calHeadCell: { width: `${100 / 7}%`, paddingVertical: 3, backgroundColor: LIGHT, borderRightWidth: 1, borderColor: BORDER, alignItems: 'center' },
  calHeadTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY },
  calCell: { width: `${100 / 7}%`, height: 22, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  calCellOn: { backgroundColor: '#bfe3dd' },
  calDay: { fontSize: 8 },
  calDayOn: { fontFamily: 'Helvetica-Bold', color: TEAL },

  // tablas genéricas
  tbl: { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDER },
  th: { backgroundColor: LIGHT, fontFamily: 'Helvetica-Bold', fontSize: 7, color: GRAY, padding: 3 },
  td: { padding: 3, fontSize: 8, borderRightWidth: 1, borderColor: BORDER },

  therapyTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: TEAL, marginTop: 6, marginBottom: 1 },

  planGrid: { flexDirection: 'row', borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  planCol: { flex: 1, borderRightWidth: 1, borderColor: BORDER },
  planHead: { backgroundColor: LIGHT, paddingVertical: 3, alignItems: 'center', borderBottomWidth: 1, borderColor: BORDER },
  planHeadTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY },
  planCell: { padding: 4, minHeight: 60 },
  planItem: { fontSize: 7.5, marginBottom: 4, textAlign: 'center' },

  totalRow: { flexDirection: 'row', backgroundColor: '#fde68a', borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  totalLabel: { flex: 1, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'right' },
  totalVal: { width: 70, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'right' },

  footer: { marginTop: 14, fontSize: 8, color: GRAY, lineHeight: 1.4 },
  footerStrong: { fontFamily: 'Helvetica-Bold', color: '#1c2935' },
})

interface Props {
  data: CycleDetailData
  /** Texto de instrucciones de pago (cuenta, etc.). */
  paymentNote?: string | null
}

const CAL_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function CycleDetailPDF({ data, paymentNote }: Props) {
  // Celdas del calendario: blancos iniciales + días del mes, en filas de 7.
  const cells: Array<{ day: number | null }> = []
  for (let i = 0; i < data.firstDowIndexMon; i++) cells.push({ day: null })
  for (let d = 1; d <= data.daysInMonth; d++) cells.push({ day: d })
  while (cells.length % 7 !== 0) cells.push({ day: null })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <Text style={s.headerTitle}>DETALLE DE PAGO MENSUAL</Text>
        </View>
        <Text style={s.childName}>{data.childName}</Text>

        {/* Calendario + desglose por terapia */}
        <View style={s.row}>
          <View style={s.col}>
            <View style={s.sectionBar}>
              <Text style={s.sectionTitle}>MES DE {data.periodLabel.toUpperCase()}</Text>
            </View>
            <View>
              <View style={s.calHeadRow}>
                {CAL_HEAD.map((h) => (
                  <View key={h} style={s.calHeadCell}>
                    <Text style={s.calHeadTxt}>{h}</Text>
                  </View>
                ))}
              </View>
              <View style={s.calGrid}>
                {cells.map((c, i) => {
                  const on = c.day != null && data.dayHasAppt[c.day]
                  return (
                    <View key={i} style={[s.calCell, on ? s.calCellOn : {}]}>
                      {c.day != null && (
                        <Text style={[s.calDay, on ? s.calDayOn : {}]}>{c.day}</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          </View>

          <View style={s.col}>
            <View style={[s.sectionBar, s.sectionBarRed]}>
              <Text style={s.sectionTitle}>DÍAS Y FECHAS POR TERAPIA</Text>
            </View>
            <View style={{ borderWidth: 1, borderColor: BORDER, borderTopWidth: 0, padding: 4 }}>
              {data.therapyBreakdowns.length === 0 && (
                <Text style={{ fontSize: 8, color: GRAY }}>Sin citas en el mes.</Text>
              )}
              {data.therapyBreakdowns.map((tb) => (
                <View key={tb.service} wrap={false}>
                  <Text style={s.therapyTitle}>{tb.label.toUpperCase()}</Text>
                  {tb.days.map((d) => (
                    <Text key={d.dow} style={{ fontSize: 7.5, marginBottom: 1 }}>
                      {d.dowLabel}: {d.count} ({d.dates.join(', ')})
                    </Text>
                  ))}
                  <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>
                    Total: {tb.total}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Plan de terapias contratado */}
        <View style={{ marginTop: 12 }}>
          <View style={s.sectionBar}>
            <Text style={s.sectionTitle}>PLAN DE TERAPIAS CONTRATADO</Text>
          </View>
          <View style={s.planGrid}>
            {data.weeklyPlan.map((cell) => (
              <View key={cell.dow} style={s.planCol}>
                <View style={s.planHead}>
                  <Text style={s.planHeadTxt}>{cell.dowLabel}</Text>
                </View>
                <View style={s.planCell}>
                  {cell.therapies.map((t, i) => (
                    <Text key={i} style={s.planItem}>{t}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Tabla de costos */}
        <View style={{ marginTop: 12 }}>
          <View style={s.tbl}>
            <View style={[s.tr, { borderTopWidth: 1 }]}>
              <Text style={[s.th, s.td, { flex: 3 }]}>CONCEPTO — TERAPIA</Text>
              <Text style={[s.th, s.td, { width: 70, textAlign: 'center' }]}># EN EL MES</Text>
              <Text style={[s.th, s.td, { width: 70, textAlign: 'right' }]}>COSTO UNIT.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right', padding: 3 }]}>TOTAL</Text>
            </View>
            {data.costRows.map((r) => (
              <View key={r.service} style={s.tr}>
                <Text style={[s.td, { flex: 3 }]}>
                  {r.label}
                  {r.isFlat ? ' (mensualidad)' : r.durationMinutes ? ` (${r.durationMinutes} min)` : ''}
                </Text>
                <Text style={[s.td, { width: 70, textAlign: 'center' }]}>{r.count}</Text>
                <Text style={[s.td, { width: 70, textAlign: 'right' }]}>${r.unitCost.toFixed(2)}</Text>
                <Text style={{ width: 70, textAlign: 'right', padding: 3, fontSize: 8 }}>
                  ${r.total.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
          {data.discountLabel && (
            <View style={[s.tr, { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 }]}>
              <Text style={{ flex: 1, padding: 4, fontSize: 8, textAlign: 'right', color: TEAL }}>
                {data.discountLabel}
              </Text>
            </View>
          )}
          {data.surcharge > 0 && (
            <View style={[s.tr, { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 }]}>
              <Text style={{ flex: 1, padding: 4, fontSize: 8, textAlign: 'right', color: RED }}>
                Recargo por mora: ${data.surcharge.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total a pagar — {data.periodLabel}</Text>
            <Text style={s.totalVal}>${data.total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Pie de pago */}
        <View style={s.footer}>
          <Text>
            El pago de la mensualidad se deberá realizar durante los{' '}
            <Text style={s.footerStrong}>primeros 5 días del mes</Text>. Pasado este período, se
            cobrará un recargo por mora del <Text style={s.footerStrong}>5% por cada 5 días de
            retraso</Text> sobre el saldo pendiente.
          </Text>
          {paymentNote ? (
            <Text style={{ marginTop: 6 }}>{paymentNote}</Text>
          ) : (
            <Text style={{ marginTop: 6 }}>
              Puede realizar depósitos o transferencias y enviar el comprobante al WhatsApp de
              Kinetic.
            </Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
