import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { ChildSessionReportsHistory } from '@/components/agenda/ChildSessionReportsHistory'
import { ChildProgressReportsHistory } from '@/components/agenda/ChildProgressReportsHistory'
import { NewProgressReportButton } from '@/components/agenda/NewProgressReportButton'
import { TreatmentPlanSection } from '@/components/families/TreatmentPlanSection'
import { MonthlyCyclesSection } from '@/components/families/MonthlyCyclesSection'
import { ChildDashboardPanel } from '@/components/dashboard/ChildDashboardPanel'
import { getChildDashboardData } from '@/lib/domain/child-dashboard'
import {
  INTAKE_PHASE_LABELS,
  TREATMENT_STATUS_LABELS,
  MORNING_PROGRAM_LABELS,
} from '@/types/db'
import type { Child, MonthlySessionCycle, TreatmentPlan } from '@/types/db'
import Link from 'next/link'

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
  searchParams: Promise<{ tab?: string }>
}

export default async function ChildProfilePage({ params, searchParams }: PageProps) {
  const { id: familyId, childId } = await params
  const { tab: tabParam } = await searchParams
  const tab: 'resumen' | 'dashboard' = tabParam === 'dashboard' ? 'dashboard' : 'resumen'
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

  // Datos comunes a ambos tabs
  const canEditPlan = MGMT_ROLES_PLAN.includes(ctx.appUser.role)
  const canManageCycles = MGMT_ROLES_CYCLES.includes(ctx.appUser.role)

  // Lazy: solo fetch lo que el tab activo necesita.
  let plan: TreatmentPlan | null = null
  let therapists: { id: string; full_name: string; role: string }[] = []
  let cycles: MonthlySessionCycle[] = []
  let dashboardData: Awaited<ReturnType<typeof getChildDashboardData>> | null = null

  if (tab === 'resumen') {
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
    plan = (planRaw as TreatmentPlan | null) ?? null
    therapists = (therapistsRaw ?? []) as { id: string; full_name: string; role: string }[]
    cycles = (cyclesRaw ?? []) as MonthlySessionCycle[]
  } else {
    dashboardData = await getChildDashboardData(supabase, childId)
  }

  const ageYears = c.birth_date
    ? Math.floor((new Date().getTime() - new Date(c.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={c.full_name} backHref={`/familias/${familyId}`} />

      <div className="flex-1 px-6 pt-6 pb-12 max-w-6xl mx-auto w-full">
        {/* Header — integrado con la página, sin card chrome */}
        <header className="space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight text-fm-on-surface">
              {c.full_name}
            </h1>
            {c.code && (
              <span className="text-xs font-mono text-fm-on-surface-variant bg-fm-surface-container px-2 py-0.5 rounded">
                {c.code}
              </span>
            )}
            {c.preferred_name && (
              <span className="text-sm text-fm-on-surface-variant italic">
                &ldquo;{c.preferred_name}&rdquo;
              </span>
            )}
          </div>
          <p className="text-sm text-fm-on-surface-variant">
            {ageYears !== null && <span>{ageYears} años</span>}
            {c.gender && <span> · {c.gender === 'M' ? 'Masculino' : c.gender === 'F' ? 'Femenino' : 'Otro'}</span>}
            {c.birth_date && (
              <span>
                {' '}· Nacido el{' '}
                {new Date(c.birth_date).toLocaleDateString('es-SV', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </p>
          {c.diagnoses_display_text && (
            <p className="text-sm text-fm-primary italic max-w-prose">{c.diagnoses_display_text}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
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
        </header>

        {/* Tab navigation */}
        <nav
          aria-label="Secciones del perfil"
          className="flex border-b border-fm-outline-variant/20 mt-8 mb-6"
        >
          <TabLink
            href={`/familias/${familyId}/children/${childId}`}
            active={tab === 'resumen'}
            label="Resumen"
            icon="article"
          />
          <TabLink
            href={`/familias/${familyId}/children/${childId}?tab=dashboard`}
            active={tab === 'dashboard'}
            label="Dashboard"
            icon="dashboard"
          />
        </nav>

        {tab === 'dashboard' && dashboardData && (
          <ChildDashboardPanel
            data={dashboardData}
            familyId={familyId}
            childId={childId}
          />
        )}

        {tab === 'resumen' && (
          <div className="space-y-10">
            {/* Bloque clínico: información de emergencia, hero del resumen */}
            <Section title="Datos clínicos" icon="emergency" tone="urgent">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Tipo de sangre" value={c.blood_type} />
                <Field label="Hospital preferido" value={c.preferred_hospital} />
                <FieldLong
                  label="Alergias / reacciones a medicamentos"
                  value={c.allergies_text}
                  highlight
                />
                <FieldLong label="Medicamentos actuales" value={c.medications_text} />
              </div>
            </Section>

            {/* Bloque contextual: 3 secciones de menor peso, en columna */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Section title="Escolaridad" minimal>
                <Field label="Colegio actual" value={c.school_name} />
                <Field label="Grado que cursa" value={c.school_grade} />
              </Section>

              <Section title="Diagnósticos" minimal>
                {c.diagnoses_json && c.diagnoses_json.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.diagnoses_json.map((d) => (
                      <span
                        key={d}
                        className="text-xs px-2.5 py-0.5 rounded-full bg-fm-surface-container border border-fm-outline-variant/30 text-fm-on-surface-variant"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-fm-on-surface-variant">
                    Sin diagnósticos registrados
                  </span>
                )}
              </Section>

              <Section title="Origen del paciente" minimal>
                <Field label="Tipo" value={c.referral_source_type} />
                <FieldLong label="Notas" value={c.referral_notes} />
              </Section>
            </div>

            {/* Bloque estructural: plan + ciclos */}
            <div className="space-y-6">
              <TreatmentPlanSection
                childId={childId}
                plan={plan}
                therapists={therapists}
                canEdit={canEditPlan}
              />
              <MonthlyCyclesSection
                childId={childId}
                plan={plan}
                cycles={cycles}
                canManage={canManageCycles}
              />
            </div>

            {/* Notas internas — cuando existen, espaciadas como pieza propia */}
            {c.notes && (
              <Section title="Notas internas" minimal>
                <p className="text-sm text-fm-on-surface whitespace-pre-wrap max-w-prose">
                  {c.notes}
                </p>
              </Section>
            )}

            {/* Histórico de actividad — agrupa los dos history widgets bajo un kicker */}
            <div className="space-y-6">
              <header>
                <p className="text-[10px] font-medium tracking-[0.18em] uppercase text-fm-on-surface-variant/70">
                  Histórico de actividad
                </p>
              </header>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-medium tracking-tight text-fm-on-surface">
                    Informes de avances
                  </h2>
                  <NewProgressReportButton familyId={familyId} childId={childId} />
                </div>
                <ChildProgressReportsHistory familyId={familyId} childId={childId} />
              </div>
              <div className="space-y-3 pt-2">
                <h2 className="text-base font-medium tracking-tight text-fm-on-surface">
                  Reportes de sesión
                </h2>
                <ChildSessionReportsHistory childId={childId} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TabLink({
  href,
  active,
  label,
  icon,
}: {
  href: string
  active: boolean
  label: string
  icon: string
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-fm-primary text-fm-primary'
          : 'border-transparent text-fm-on-surface-variant hover:text-fm-on-surface hover:border-fm-outline-variant/40'
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </Link>
  )
}

function Section({
  title,
  icon,
  tone,
  minimal,
  children,
}: {
  title: string
  icon?: string
  tone?: 'urgent' | 'default'
  /** Variante sin chrome (sin border, sin bg) — para secciones secundarias. */
  minimal?: boolean
  children: React.ReactNode
}) {
  if (minimal) {
    return (
      <div className="space-y-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-fm-on-surface-variant">
          {title}
        </h2>
        <div className="space-y-3">{children}</div>
      </div>
    )
  }
  return (
    <section className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        {icon && (
          <span
            className={`material-symbols-outlined text-lg ${
              tone === 'urgent' ? 'text-fm-error' : 'text-fm-primary'
            }`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h2 className="text-sm font-semibold text-fm-on-surface">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
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
