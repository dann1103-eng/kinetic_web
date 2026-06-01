import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
} from '@/components/reportes/pdf/KineticReportPdf'
import { fmtUsd, formatPeriodLabel } from '@/lib/domain/payroll/calculation'
import type { PayrollItem, PayrollRun } from '@/types/db'

interface ItemRow extends PayrollItem {
  user: { id: string; full_name: string; email: string; role: string } | null
}

interface Props {
  run: PayrollRun
  items: ItemRow[]
  logoUrl?: string | null
}

export function PayrollRunPDF({ run, items, logoUrl }: Props) {
  const period = formatPeriodLabel(run.period_year, run.period_month)
  const isSp = run.payroll_type === 'servicios_profesionales'
  const totals = items.reduce(
    (acc, it) => ({
      base: acc.base + Number(it.base_salary_usd),
      extras: acc.extras + Number(it.extra_hours_amount_usd) + Number(it.bonus_usd),
      gross: acc.gross + Number(it.gross_total_usd),
      isssEmp: acc.isssEmp + Number(it.isss_employee_usd),
      afpEmp: acc.afpEmp + Number(it.afp_employee_usd),
      isr: acc.isr + Number(it.isr_usd),
      otherDed: acc.otherDed + Number(it.other_deductions_usd),
      totalDed: acc.totalDed + Number(it.total_deductions_usd),
      net: acc.net + Number(it.net_pay_usd),
      isssPat: acc.isssPat + Number(it.isss_employer_usd),
      afpPat: acc.afpPat + Number(it.afp_employer_usd),
      employerCost: acc.employerCost + Number(it.employer_cost_usd),
    }),
    { base: 0, extras: 0, gross: 0, isssEmp: 0, afpEmp: 0, isr: 0, otherDed: 0, totalDed: 0, net: 0, isssPat: 0, afpPat: 0, employerCost: 0 },
  )

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.pageA4Landscape}>
        <ShellHeader
          title={isSp ? 'Planilla de servicios profesionales' : 'Planilla mensual'}
          subtitle={period}
          filtersLine={`Estado: ${run.status} · ${items.length} empleados · Generado ${nowSvLabel()}`}
          logoUrl={logoUrl}
        />

        {isSp ? (
          <>
            <View style={[sharedStyles.tableHeader, { marginTop: 10 }]}>
              <Text style={[sharedStyles.tableHeaderCell, { flex: 3 }]}>Empleado</Text>
              <Text style={[sharedStyles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Honorarios</Text>
              <Text style={[sharedStyles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Retención ISR</Text>
              <Text style={[sharedStyles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Neto</Text>
            </View>
            {items.length === 0 ? (
              <View style={sharedStyles.tableRow}>
                <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin ítems.</Text>
              </View>
            ) : (
              items.map((it, i) => {
                const snap = it.user_snapshot_json
                const name = snap?.full_name ?? it.user?.full_name ?? '—'
                const role = snap?.role ?? it.user?.role ?? ''
                return (
                  <View
                    key={it.id}
                    style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
                  >
                    <View style={{ flex: 3 }}>
                      <Text style={sharedStyles.cellBold}>{name}</Text>
                      <Text style={{ fontSize: 7, color: '#64748b' }}>
                        {role.replace('_', ' ')}
                        {snap?.dui ? ` · DUI ${snap.dui}` : ''}
                      </Text>
                    </View>
                    <Text style={[sharedStyles.cellBold, { flex: 1.5, textAlign: 'right' }]}>
                      {fmtUsd(Number(it.gross_total_usd))}
                    </Text>
                    <Text style={[sharedStyles.cell, { flex: 1.5, textAlign: 'right', color: '#b31b25' }]}>
                      −{fmtUsd(Number(it.isr_usd))}
                    </Text>
                    <Text style={[sharedStyles.cellBold, { flex: 1.5, textAlign: 'right', color: KINETIC_TEAL }]}>
                      {fmtUsd(Number(it.net_pay_usd))}
                    </Text>
                  </View>
                )
              })
            )}
            <View style={sharedStyles.totalsRow}>
              <Text style={[sharedStyles.totalsLabel, { flex: 3 }]}>Totales</Text>
              <Text style={[sharedStyles.cellBold, { flex: 1.5, textAlign: 'right' }]}>{fmtUsd(totals.gross)}</Text>
              <Text style={[sharedStyles.cellBold, { flex: 1.5, textAlign: 'right', color: '#b31b25' }]}>
                −{fmtUsd(totals.isr)}
              </Text>
              <Text style={[sharedStyles.totalsValue, { flex: 1.5, textAlign: 'right' }]}>
                {fmtUsd(totals.net)}
              </Text>
            </View>
            <View style={{ marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderColor: '#dfe3e6' }}>
              <Text style={{ fontSize: 8, color: '#64748b' }}>
                Régimen de servicios profesionales: solo retención de renta. No aplica ISSS ni AFP.
              </Text>
            </View>
          </>
        ) : (
        <>
        <View style={[sharedStyles.tableHeader, { marginTop: 10 }]}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 2 }]}>Empleado</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Base</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Extras</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Bruto</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>ISSS</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>AFP</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>ISR</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Deduc.</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Neto</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Costo patrono</Text>
        </View>

        {items.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin ítems.</Text>
          </View>
        ) : (
          items.map((it, i) => {
            const snap = it.user_snapshot_json
            const name = snap?.full_name ?? it.user?.full_name ?? '—'
            const role = snap?.role ?? it.user?.role ?? ''
            const extraHoursAmount = Number(it.extra_hours_amount_usd)
            const bonus = Number(it.bonus_usd)
            const extras = extraHoursAmount + bonus
            const hours = Number(it.extra_hours)
            const extrasDetail = [
              hours > 0 ? `${hours}h` : null,
              bonus > 0 ? 'bono' : null,
            ].filter(Boolean).join(' + ')
            return (
              <View
                key={it.id}
                style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
              >
                <View style={{ flex: 2 }}>
                  <Text style={sharedStyles.cellBold}>{name}</Text>
                  <Text style={{ fontSize: 7, color: '#64748b' }}>
                    {role.replace('_', ' ')}
                    {snap?.dui ? ` · DUI ${snap.dui}` : ''}
                  </Text>
                </View>
                <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>
                  {fmtUsd(Number(it.base_salary_usd))}
                </Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      sharedStyles.cell,
                      { textAlign: 'right', color: extras > 0 ? '#1e293b' : '#94a3b8' },
                    ]}
                  >
                    {extras > 0 ? `+${fmtUsd(extras)}` : '—'}
                  </Text>
                  {extras > 0 && extrasDetail && (
                    <Text style={{ fontSize: 6, color: '#64748b', textAlign: 'right' }}>
                      {extrasDetail}
                    </Text>
                  )}
                </View>
                <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>
                  {fmtUsd(Number(it.gross_total_usd))}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
                  −{fmtUsd(Number(it.isss_employee_usd))}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
                  −{fmtUsd(Number(it.afp_employee_usd))}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
                  −{fmtUsd(Number(it.isr_usd))}
                </Text>
                <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
                  −{fmtUsd(Number(it.total_deductions_usd))}
                </Text>
                <Text style={[sharedStyles.cellBold, { flex: 1.2, textAlign: 'right', color: KINETIC_TEAL }]}>
                  {fmtUsd(Number(it.net_pay_usd))}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 1, textAlign: 'right' }]}>
                  {fmtUsd(Number(it.employer_cost_usd))}
                </Text>
              </View>
            )
          })
        )}

        {/* Totales */}
        <View style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, { flex: 2 }]}>Totales</Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>{fmtUsd(totals.base)}</Text>
          <Text
            style={[
              sharedStyles.cellBold,
              { flex: 1, textAlign: 'right', color: totals.extras > 0 ? '#1e293b' : '#94a3b8' },
            ]}
          >
            {totals.extras > 0 ? `+${fmtUsd(totals.extras)}` : '—'}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>{fmtUsd(totals.gross)}</Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
            −{fmtUsd(totals.isssEmp)}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
            −{fmtUsd(totals.afpEmp)}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
            −{fmtUsd(totals.isr)}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right', color: '#b31b25' }]}>
            −{fmtUsd(totals.totalDed)}
          </Text>
          <Text style={[sharedStyles.totalsValue, { flex: 1.2, textAlign: 'right' }]}>
            {fmtUsd(totals.net)}
          </Text>
          <Text style={[sharedStyles.cellBold, { flex: 1, textAlign: 'right' }]}>
            {fmtUsd(totals.employerCost)}
          </Text>
        </View>

        {/* Aportes patronales */}
        <View style={{ marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderColor: '#dfe3e6' }}>
          <Text style={{ fontSize: 8, color: '#1e293b', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>
            Aportes patronales (no afectan el neto del empleado)
          </Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <Text style={{ fontSize: 9, color: '#64748b' }}>
              ISSS patrono: <Text style={sharedStyles.cellBold}>{fmtUsd(totals.isssPat)}</Text>
            </Text>
            <Text style={{ fontSize: 9, color: '#64748b' }}>
              AFP patrono: <Text style={sharedStyles.cellBold}>{fmtUsd(totals.afpPat)}</Text>
            </Text>
            <Text style={{ fontSize: 9, color: '#64748b' }}>
              Costo total: <Text style={sharedStyles.cellBold}>{fmtUsd(totals.employerCost)}</Text>
            </Text>
          </View>
        </View>
        </>
        )}

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}
