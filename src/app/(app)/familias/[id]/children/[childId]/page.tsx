import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { ChildSessionReportsHistory } from '@/components/agenda/ChildSessionReportsHistory'
import { ChildProgressReportsHistory } from '@/components/agenda/ChildProgressReportsHistory'
import { NewProgressReportButton } from '@/components/agenda/NewProgressReportButton'
import { TreatmentPlanSection } from '@/components/families/TreatmentPlanSection'
import { MonthlyCyclesSection } from '@/components/families/MonthlyCyclesSection'
import {
  INTAKE_PHASE_LABELS,
  TREATMENT_STATUS_LABELS,
  MORNING_PROGRAM_LABELS,
} from '@/types/db'
import type { Child, MonthlySessionCycle, TreatmentPlan } from '@/types/db'

const MGMT_ROLES_PLAN = ['admin', 'directora', 'coordinadora_terapias']
const MGMT_ROLES_CYCLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string; childId: string }>
}

export default async function ChildProfilePage({ params }: PageProps) {
  const { id: familyId, childId } = await params
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()
  const { data: child, error } = await supabase
    .from('children')
    .select('*')
    .eq('id', childId)
    .eq('family_id', familyId)
    .maybeSingle()

  if (error || !child) notFound()
  const c = child as Child

  // Cargar plan de tratamiento + lista de terapistas + ciclos mensuales en paralelo
  const [{ data: planRaw }, { data: therapistsRaw }, { data: cyclesRaw }] = await Promise.all([
    supabase.from('treatment_plans').select('*').eq('child_id', childId).maybeSingle(),
    supabase
      .from('users')
      .select('id, full_name, role')
      .in('role', ['terapista', 'maestra'])
      .order('full_name'),
    supabase
      .from('monthly_session_cycles')
      .select('*')
      .eq('child_id', childId)
      .order('period_month', { ascending: false }),
  ])
  const plan = (planRaw as TreatmentPlan | null) ?? null
  const therapists = (therapistsRaw ?? []) as { id: string; full_name: string; role: string }[]
  const cycles = (cyclesRaw ?? []) as MonthlySessionCycle[]
  const canEditPlan = MGMT_ROLES_PLAN.includes(ctx.appUser.role)
  const canManageCycles = MGMT_ROLES_CYCLES.includes(ctx.appUser.role)

  const ageYears = c.birth_date
    ? Math.floor((new Date().getTime() - new Date(c.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={c.full_name} backHref={`/familias/${familyId}`} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header del niño */}
        <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-fm-on-surface">{c.full_name}</h1>
                {c.code && (
                  <span className="text-xs font-mono text-fm-on-surface-variant bg-fm-surface-container px-2 py-0.5 rounded">
                    {c.code}
                  </span>
                )}
              </div>
              {c.preferred_name && <p className="text-sm text-fm-on-surface-variant italic">&ldquo;{c.preferred_name}&rdquo;</p>}
              <p className="text-sm text-fm-on-surface-variant mt-1">
                {ageYears !== null && <span>{ageYears} años</span>}
                {c.gender && <span> · {c.gender === 'M' ? 'Masculino' : c.gender === 'F' ? 'Femenino' : 'Otro'}</span>}
                {c.birth_date && <span> · Nacido el {new Date(c.birth_date).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
              </p>
              {c.diagnoses_display_text && (
                <p className="text-sm text-fm-primary italic mt-2">{c.diagnoses_display_text}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {c.enrolled_program && (
              <span className="text-xs px-3 py-1 rounded-full bg-fm-secondary/15 text-fm-secondary font-medium">
                Programa: {MORNING_PROGRAM_LABELS[c.enrolled_program]}
              </span>
            )}
            <span className="text-xs px-3 py-1 rounded-full bg-fm-primary/10 text-fm-primary font-medium">
              Fase: {INTAKE_PHASE_LABELS[c.intake_phase]}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-fm-surface-container text-fm-on-surface-variant font-medium">
              {TREATMENT_STATUS_LABELS[c.treatment_status]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Datos clínicos — único section header con icono porque es info de emergencia */}
          <Section title="Datos clínicos" icon="emergency" tone="urgent">
            <Field label="Tipo de sangre" value={c.blood_type} />
            <Field label="Hospital preferido" value={c.preferred_hospital} />
            <FieldLong label="Alergias / reacciones a medicamentos" value={c.allergies_text} highlight />
            <FieldLong label="Medicamentos actuales" value={c.medications_text} />
          </Section>

          {/* Escolaridad */}
          <Section title="Escolaridad">
            <Field label="Colegio actual" value={c.school_name} />
            <Field label="Grado que cursa" value={c.school_grade} />
          </Section>

          {/* Diagnósticos */}
          <Section title="Diagnósticos">
            {c.diagnoses_json && c.diagnoses_json.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {c.diagnoses_json.map((d) => (
                  <span key={d} className="text-xs px-3 py-1 rounded-full bg-fm-surface-container border border-fm-outline-variant/30 text-fm-on-surface-variant">
                    {d}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-fm-on-surface-variant">Sin diagnósticos registrados</span>
            )}
            {c.diagnoses_display_text && (
              <p className="text-xs text-fm-on-surface-variant mt-3 italic max-w-prose">
                Texto editorial para informes: <span className="not-italic font-medium">{c.diagnoses_display_text}</span>
              </p>
            )}
          </Section>

          {/* Origen / referencia */}
          <Section title="Origen del paciente">
            <Field label="Tipo" value={c.referral_source_type} />
            <FieldLong label="Notas de referencia" value={c.referral_notes} />
          </Section>
        </div>

        {/* Plan de tratamiento (ficha de acuerdo) */}
        <TreatmentPlanSection
          childId={childId}
          plan={plan}
          therapists={therapists}
          canEdit={canEditPlan}
        />

        {/* Ciclos mensuales (Ronda 2) */}
        <MonthlyCyclesSection
          childId={childId}
          plan={plan}
          cycles={cycles}
          canManage={canManageCycles}
        />

        {/* Notas internas */}
        {c.notes && (
          <div className="bg-fm-surface-container-low rounded-2xl border border-fm-outline-variant/20 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-2">Notas internas</h3>
            <p className="text-sm text-fm-on-surface whitespace-pre-wrap max-w-prose">{c.notes}</p>
          </div>
        )}

        {/* Informes de avances cuatrimestrales */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-fm-on-surface">Informes de avances</h2>
            <NewProgressReportButton familyId={familyId} childId={childId} />
          </div>
          <ChildProgressReportsHistory familyId={familyId} childId={childId} />
        </div>

        {/* Histórico de reportes de sesión */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-fm-on-surface">Reportes de sesión</h2>
          <ChildSessionReportsHistory childId={childId} />
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string
  icon?: string
  tone?: 'urgent' | 'default'
  children: React.ReactNode
}) {
  return (
    <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <span
            className={`material-symbols-outlined text-lg ${tone === 'urgent' ? 'text-fm-error' : 'text-fm-primary'}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h2 className="text-sm font-semibold text-fm-on-surface">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">{label}</div>
      <div className="text-sm text-fm-on-surface mt-0.5">{value || <span className="text-fm-on-surface-variant">—</span>}</div>
    </div>
  )
}

function FieldLong({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant">{label}</div>
      <div className={`text-sm mt-0.5 whitespace-pre-wrap max-w-prose ${highlight && value ? 'text-fm-error font-medium' : 'text-fm-on-surface'}`}>
        {value || <span className="text-fm-on-surface-variant font-normal">—</span>}
      </div>
    </div>
  )
}
