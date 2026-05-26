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
import { ChildPhotoUploader } from '@/components/families/ChildPhotoUploader'
import { ChildIntakePipelinePanel } from '@/components/children/ChildIntakePipelinePanel'
import { listPhaseCatalog } from '@/app/actions/intake-pipeline'
import { getChildDashboardData } from '@/lib/domain/child-dashboard'
import { MORNING_PROGRAM_LABELS } from '@/types/db'
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
// Terapistas y maestras tienen su propia vista restringida en /mis-ninos/[childId].
const REDIRECT_TO_MY_KIDS = ['terapista', 'maestra']

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
  if (REDIRECT_TO_MY_KIDS.includes(ctx.appUser.role)) {
    redirect(`/mis-ninos/${childId}`)
  }

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
  let therapyCatalog: import('@/types/db').ServiceCatalogItem[] = []
  let dashboardData: Awaited<ReturnType<typeof getChildDashboardData>> | null = null

  if (tab === 'resumen') {
    const [{ data: planRaw }, { data: therapistsRaw }, { data: cyclesRaw }, { data: catalogRaw }] = await Promise.all([
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
      supabase
        .from('service_catalog')
        .select('*')
        .eq('category', 'terapia_individual')
        .eq('active', true)
        .order('sort_order'),
    ])
    plan = (planRaw as TreatmentPlan | null) ?? null
    therapists = (therapistsRaw ?? []) as { id: string; full_name: string; role: string }[]
    cycles = (cyclesRaw ?? []) as MonthlySessionCycle[]
    therapyCatalog = (catalogRaw ?? []) as import('@/types/db').ServiceCatalogItem[]
  } else {
    dashboardData = await getChildDashboardData(supabase, childId)
  }

  const ageYears = c.birth_date
    ? Math.floor((new Date().getTime() - new Date(c.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // Catálogo de sub-fases para el widget de pipeline
  const phaseCatalog = await listPhaseCatalog()

  // Autores que aparecen en el timeline del niño
  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .in('role', [
      'admin',
      'directora',
      'supervisor',
      'coordinadora_familias',
      'coordinadora_terapias',
      'terapista',
      'maestra',
      'recepcion',
      'contable',
    ])
  const phaseAuthorsById: Record<string, string> = {}
  for (const row of (staffRaw ?? []) as { id: string; full_name: string }[]) {
    phaseAuthorsById[row.id] = row.full_name
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={c.full_name} backHref={`/familias/${familyId}`} />

      <div className="flex-1 px-6 pt-6 pb-12 max-w-6xl mx-auto w-full">
        {/* Header — integrado con la página, sin card chrome */}
        <header className="space-y-3">
          <div className="flex items-center gap-4">
            <ChildPhotoUploader
              childId={childId}
              childName={c.full_name}
              photoUrl={c.photo_url ?? null}
              canEdit={canEditPlan || ctx.appUser.role === 'terapista' || ctx.appUser.role === 'maestra'}
            />
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
          {c.enrolled_program && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs px-3 py-1 rounded-full bg-fm-secondary/15 text-fm-secondary font-medium">
                Programa: {MORNING_PROGRAM_LABELS[c.enrolled_program]}
              </span>
            </div>
          )}
        </header>

        {/* Pipeline de admisión (mig 0121) */}
        <div className="mt-6">
          <ChildIntakePipelinePanel
            childId={childId}
            childName={c.preferred_name ?? c.full_name}
            currentPhaseCode={c.current_phase_code}
            phaseCatalog={phaseCatalog}
            authorNamesById={phaseAuthorsById}
          />
        </div>

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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-8">
            {/* LEFT RAIL — info de referencia que el usuario quiere ver siempre */}
            <aside className="lg:col-span-4 lg:sticky lg:top-6 lg:self-start space-y-6 min-w-0">
              {/* Datos clínicos: la única card con chrome en el rail (urgent tone) */}
              <Section title="Datos clínicos" icon="emergency" tone="urgent" compact>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                    <Field label="Sangre" value={c.blood_type} />
                    <Field label="Hospital" value={c.preferred_hospital} />
                  </div>
                  <div className="pt-3 border-t border-fm-outline-variant/15 space-y-3">
                    <FieldLong
                      label="Alergias / reacciones"
                      value={c.allergies_text}
                      highlight
                    />
                    <FieldLong label="Medicamentos" value={c.medications_text} />
                  </div>
                </div>
              </Section>

              {/* Escolaridad y Origen agrupados en un mismo bloque minimal */}
              <Section title="Escolaridad" minimal>
                <Field label="Colegio actual" value={c.school_name} />
                <Field label="Grado que cursa" value={c.school_grade} />
              </Section>

              <Section title="Origen del paciente" minimal>
                <Field label="Tipo" value={c.referral_source_type} />
                <FieldLong label="Notas" value={c.referral_notes} />
              </Section>

              {c.notes && (
                <Section title="Notas internas" minimal>
                  <p className="text-sm text-fm-on-surface whitespace-pre-wrap">
                    {c.notes}
                  </p>
                </Section>
              )}
            </aside>

            {/* MAIN — área de trabajo */}
            <main className="lg:col-span-8 space-y-8 min-w-0">
              {/* Strip de diagnósticos: badges ICD-10 al inicio del área de trabajo */}
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

              {/* Bloque estructural: plan + ciclos */}
              <TreatmentPlanSection
                childId={childId}
                plan={plan}
                therapists={therapists}
                canEdit={canEditPlan}
                therapyCatalog={therapyCatalog}
                enrolledProgram={c.enrolled_program}
              />
              <MonthlyCyclesSection
                childId={childId}
                plan={plan}
                cycles={cycles}
                canManage={canManageCycles}
              />

              {/* Histórico de actividad */}
              <div className="space-y-6 pt-2">
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
            </main>
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
  compact,
  children,
}: {
  title: string
  icon?: string
  tone?: 'urgent' | 'default'
  /** Variante sin chrome (sin border, sin bg) — para secciones secundarias. */
  minimal?: boolean
  /** Variante con chrome pero padding reducido — pensada para sidebars/rails. */
  compact?: boolean
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
    <section
      className={`bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 ${
        compact ? 'p-4' : 'p-5 md:p-6'
      }`}
    >
      <div className={`flex items-center gap-2 ${compact ? 'mb-3' : 'mb-4'}`}>
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
