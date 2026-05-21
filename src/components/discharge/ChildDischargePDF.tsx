import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  sharedStyles,
  ShellHeader,
  ShellFooter,
  nowSvLabel,
  KINETIC_TEAL,
} from '@/components/reportes/pdf/KineticReportPdf'
import { DISCHARGE_TYPE_LABELS } from '@/types/db'
import type { ChildDischargeRecord } from '@/types/db'

interface Props {
  record: ChildDischargeRecord
  logoUrl?: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ChildDischargePDF({ record, logoUrl }: Props) {
  const isAlta = record.discharge_type === 'alta'
  const title = isAlta ? 'Carta de Alta Terapéutica' : 'Constancia de Retiro'
  const child = record.child_snapshot_json
  const therapies = record.therapies_snapshot_json ?? []

  return (
    <Document>
      <Page size="A4" style={sharedStyles.pageA4Portrait}>
        <ShellHeader
          title={title}
          subtitle={DISCHARGE_TYPE_LABELS[record.discharge_type]}
          filtersLine={`Generado ${nowSvLabel()}`}
          logoUrl={logoUrl}
        />

        {/* Bloque 1 — Datos del niño */}
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
            Datos del paciente
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e293b', marginTop: 2 }}>
            {child.full_name}
            {child.preferred_name && (
              <Text style={{ fontFamily: 'Helvetica', fontSize: 11, color: '#64748b' }}>
                {' '}({child.preferred_name})
              </Text>
            )}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            <Text style={{ fontSize: 8, color: '#64748b' }}>
              Fecha de nacimiento: {fmtDate(child.birth_date)}
            </Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>
              Ingreso: {fmtDate(child.enrollment_started_at)}
            </Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>
              {isAlta ? 'Alta' : 'Retiro'}: {fmtDate(record.discharge_date)}
            </Text>
          </View>
          {child.diagnoses_display_text && (
            <Text style={{ fontSize: 8, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
              Diagnóstico: {child.diagnoses_display_text}
            </Text>
          )}
        </View>

        {/* Bloque 2 — Resumen estadístico */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <KpiCard
            label="Sesiones asistidas"
            value={String(record.total_sessions_attended ?? 0)}
          />
          <KpiCard
            label="% Asistencia"
            value={`${record.attendance_rate_pct?.toFixed(0) ?? 0}%`}
          />
          <KpiCard
            label="Reposiciones"
            value={String(record.total_replacements ?? 0)}
          />
        </View>

        {/* Bloque 2b — Terapias recibidas */}
        {therapies.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Terapias recibidas
            </Text>
            {therapies.map((t, i) => (
              <Text key={i} style={{ fontSize: 9, color: '#334155', marginBottom: 2 }}>
                • {t.label}
              </Text>
            ))}
          </View>
        )}

        {/* Bloque 3 — Objetivos alcanzados */}
        {record.objectives_achieved && (
          <Block title="Objetivos alcanzados" body={record.objectives_achieved} />
        )}

        {/* Bloque 4 — Recomendaciones */}
        {record.recommendations && (
          <Block title="Recomendaciones" body={record.recommendations} />
        )}
        {record.follow_up_plan && (
          <Block title="Plan de seguimiento" body={record.follow_up_plan} />
        )}

        {/* Motivo de retiro (si aplica) */}
        {!isAlta && record.discharge_reason && (
          <Block title="Motivo del retiro" body={record.discharge_reason} />
        )}

        {/* Bloque 5 — Firmas */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
          <Signature
            label="Terapista responsable"
            name={record.signed_by_therapist_name}
            signedAt={record.signed_by_therapist_at}
          />
          <Signature
            label="Directora"
            name={record.signed_by_directora_name}
            signedAt={record.signed_by_directora_at}
          />
        </View>

        <ShellFooter generatedAtSV={nowSvLabel()} />
      </Page>
    </Document>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 10,
        borderWidth: 0.5,
        borderColor: '#dfe3e6',
        borderRadius: 4,
        backgroundColor: '#f8fafc',
      }}
    >
      <Text style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: KINETIC_TEAL, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 10, color: '#334155', lineHeight: 1.5 }}>
        {body}
      </Text>
    </View>
  )
}

function Signature({
  label,
  name,
  signedAt,
}: {
  label: string
  name: string | null
  signedAt: string | null
}) {
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          borderTopWidth: 0.5,
          borderTopColor: '#94a3b8',
          paddingTop: 4,
        }}
      >
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1e293b' }}>
          {name ?? '____________________'}
        </Text>
        <Text style={{ fontSize: 8, color: '#64748b' }}>{label}</Text>
        {signedAt && (
          <Text style={{ fontSize: 7, color: '#10b981', marginTop: 2, fontStyle: 'italic' }}>
            ✓ Firmado digitalmente · {fmtDate(signedAt)}
          </Text>
        )}
      </View>
    </View>
  )
}
