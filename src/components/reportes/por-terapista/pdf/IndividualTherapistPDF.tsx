import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
  KINETIC_RED,
} from '@/components/reportes/pdf/KineticReportPdf'
import {
  fmtHours,
  fmtPercent,
  type TherapistDetailedReport,
} from '@/lib/domain/reports/therapist'
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/types/db'

interface Props {
  detail: TherapistDetailedReport
  logoUrl?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'En curso',
  completed: 'Completada',
  no_show: 'No-show',
  late_cancel: 'Cancel. tardía',
  rescheduled: 'Reagendada',
  replacement: 'Reposición',
  cancelled: 'Cancelada',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#047857',
  no_show: KINETIC_RED,
  late_cancel: '#b45309',
  scheduled: '#64748b',
  in_progress: '#0369a1',
  rescheduled: '#64748b',
  replacement: KINETIC_TEAL,
  cancelled: '#64748b',
}

export function IndividualTherapistPDF({ detail, logoUrl }: Props) {
  const { therapist, monthLabel, kpis, appointments } = detail

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title={therapist.full_name}
          subtitle={`Reporte mensual · ${monthLabel}`}
          filtersLine={`Rol: ${therapist.role.replace('_', ' ')} · Generado ${nowSvLabel()}`}
          logoUrl={logoUrl}
        />

        {/* KPI cards */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 }}>
          <KpiBox label="Completadas" value={String(kpis.attendance.completed)} accent={KINETIC_TEAL} />
          <KpiBox label="No-shows" value={String(kpis.attendance.no_show)} accent={KINETIC_RED} />
          <KpiBox label="Cancel. tardía" value={String(kpis.attendance.late_cancel)} accent="#b45309" />
          <KpiBox label="Reposiciones" value={String(kpis.attendance.replacement_attended)} accent={KINETIC_TEAL} />
        </View>

        {/* Carga horaria */}
        <View
          style={{
            marginBottom: 12,
            padding: 10,
            borderWidth: 0.5,
            borderColor: '#dfe3e6',
            borderRadius: 4,
          }}
        >
          <Text
            style={{
              fontSize: 8,
              fontFamily: 'Helvetica-Bold',
              color: '#1e293b',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Carga horaria
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <KpiInline label="Trabajadas" value={fmtHours(kpis.hoursLoad.hoursWorked)} />
            <KpiInline
              label="Contratadas (estimadas)"
              value={kpis.hoursLoad.hoursContracted == null
                ? '—'
                : fmtHours(kpis.hoursLoad.hoursContracted)}
            />
            <KpiInline
              label="% Ocupación"
              value={kpis.hoursLoad.occupancyPct == null
                ? '—'
                : fmtPercent(kpis.hoursLoad.occupancyPct, 1)}
              tone={occupancyTone(kpis.hoursLoad.occupancyPct)}
            />
            <KpiInline
              label="Tope semanal"
              value={kpis.hoursLoad.maxHoursPerWeek == null
                ? 'sin contrato'
                : `${kpis.hoursLoad.maxHoursPerWeek}h/sem`}
            />
          </View>
        </View>

        {/* Informes cuatrimestrales */}
        <View
          style={{
            marginBottom: 12,
            padding: 10,
            borderWidth: 0.5,
            borderColor: '#dfe3e6',
            borderRadius: 4,
          }}
        >
          <Text
            style={{
              fontSize: 8,
              fontFamily: 'Helvetica-Bold',
              color: '#1e293b',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Cumplimiento de informes
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <KpiInline label="Niños a cargo" value={String(kpis.reports.childrenAsPrimary)} />
            <KpiInline label="Informes vencidos" value={String(kpis.reports.reportsDue)} />
            <KpiInline label="Entregados" value={String(kpis.reports.reportsDelivered)} tone={KINETIC_TEAL} />
            <KpiInline
              label="Pendientes"
              value={String(kpis.reports.reportsPending)}
              tone={kpis.reports.reportsPending > 0 ? KINETIC_RED : undefined}
            />
            <KpiInline
              label="% Cumpl."
              value={kpis.reports.reportsDue === 0 ? '—' : fmtPercent(kpis.reports.compliancePct, 1)}
              tone={complianceTone(kpis.reports.compliancePct, kpis.reports.reportsDue)}
            />
          </View>
        </View>

        {/* Listado de citas */}
        <Text
          style={{
            fontSize: 8,
            fontFamily: 'Helvetica-Bold',
            color: '#1e293b',
            marginTop: 6,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Detalle de citas ({appointments.length})
        </Text>

        <View style={sharedStyles.tableHeader}>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1 }]}>Fecha</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 2 }]}>Niño/a</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.5 }]}>Servicio</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 1.2 }]}>Estado</Text>
          <Text style={[sharedStyles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Min.</Text>
        </View>

        {appointments.length === 0 ? (
          <View style={sharedStyles.tableRow}>
            <Text style={[sharedStyles.cell, { flex: 1 }]}>Sin citas en el período.</Text>
          </View>
        ) : (
          appointments.map((a, i) => {
            const serviceLabel = a.serviceType
              ? SERVICE_TYPE_LABELS[a.serviceType as ServiceType] ?? a.serviceType
              : '—'
            return (
              <View
                key={`${a.date}-${i}`}
                style={[sharedStyles.tableRow, i % 2 === 1 ? sharedStyles.tableRowAlt : {}]}
              >
                <Text style={[sharedStyles.cell, { flex: 1 }]}>{a.date}</Text>
                <Text style={[sharedStyles.cellBold, { flex: 2 }]}>
                  {a.childName ?? '—'}
                  {a.isReplacement && (
                    <Text style={{ fontSize: 7, color: KINETIC_TEAL }}> (rep.)</Text>
                  )}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 1.5 }]}>{serviceLabel}</Text>
                <Text
                  style={[
                    sharedStyles.cellBold,
                    { flex: 1.2, color: STATUS_COLORS[a.status] ?? '#1e293b' },
                  ]}
                >
                  {STATUS_LABELS[a.status] ?? a.status}
                </Text>
                <Text style={[sharedStyles.cell, { flex: 0.8, textAlign: 'right' }]}>
                  {a.durationMinutes}
                </Text>
              </View>
            )
          })
        )}

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

function KpiInline({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 6.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: tone ?? '#1e293b',
          fontFamily: 'Helvetica-Bold',
          marginTop: 1,
        }}
      >
        {value}
      </Text>
    </View>
  )
}

function occupancyTone(pct: number | null): string | undefined {
  if (pct == null) return undefined
  if (pct < 60) return '#047857'
  if (pct <= 85) return '#b45309'
  return KINETIC_RED
}

function complianceTone(pct: number, due: number): string | undefined {
  if (due === 0) return undefined
  if (pct >= 90) return '#047857'
  if (pct >= 70) return '#b45309'
  return KINETIC_RED
}
