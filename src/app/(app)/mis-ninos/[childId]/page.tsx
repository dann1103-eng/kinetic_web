import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { ChildDashboardCalendar } from '@/components/dashboard/ChildDashboardCalendar'
import { ChildSessionReportsHistory } from '@/components/agenda/ChildSessionReportsHistory'
import { JournalTab } from '@/app/(app)/familias/[id]/JournalTab'
import { getChildDashboardData } from '@/lib/domain/child-dashboard'
import { userCanViewChild } from '@/lib/domain/my-children'
import { formatSvDateTime } from '@/lib/format/datetime-sv'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  Child,
  Appointment,
  TreatmentPlan,
  ProgressReport,
} from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['terapista', 'maestra']

interface PageProps {
  params: Promise<{ childId: string }>
}

function formatAge(birth: string | null): string | null {
  if (!birth) return null
  const b = new Date(birth)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--
  return `${years} año${years === 1 ? '' : 's'}`
}

// Hora de la cita en zona El Salvador (server = UTC sin esto → mostraba +6h).
const formatDateTime = formatSvDateTime

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const REPORT_STATUS_LABEL: Record<ProgressReport['status'], string> = {
  draft: 'Borrador',
  submitted: 'Esperando aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent_to_family: 'Enviado a la familia',
}

export default async function MisNinosChildPage({ params }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const { childId } = await params
  const supabase = await createClient()

  // Verificar que tenga permiso de ver este niño
  const allowed = await userCanViewChild(supabase, ctx.appUser.id, ctx.appUser.role, childId)
  if (!allowed) notFound()

  // Cargar todos los datos en paralelo (session_reports los carga el
  // componente ChildSessionReportsHistory por su cuenta)
  const [
    { data: child },
    { data: plan },
    { data: futureAppts },
    { data: pastAppts },
    { data: progressReports },
  ] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).maybeSingle(),
    supabase
      .from('treatment_plans')
      .select('*')
      .eq('child_id', childId)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('appointments')
      .select('*')
      .eq('child_id', childId)
      .gte('starts_at', new Date().toISOString())
      .in('status', ['scheduled', 'in_progress', 'replacement'])
      .order('starts_at', { ascending: true })
      .limit(10),
    supabase
      .from('appointments')
      .select('*')
      .eq('child_id', childId)
      .lt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: false })
      .limit(10),
    supabase
      .from('progress_reports')
      .select('*')
      .eq('child_id', childId)
      .order('period_starts', { ascending: false })
      .limit(8),
  ])

  if (!child) notFound()
  const c = child as Child

  const isBlueKids = c.enrolled_program === 'blue_kids'

  // Datos para el calendario — usa el mismo helper que el child profile main.
  const dashboardData = await getChildDashboardData(supabase, childId)
  const displayName = c.preferred_name ?? c.full_name
  const age = formatAge(c.birth_date)

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={displayName} backHref="/mis-ninos" />

      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-6xl mx-auto w-full space-y-8">
        {/* Header */}
        <header className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-6 md:p-8 flex items-start gap-5">
          <div className="w-20 h-20 rounded-3xl overflow-hidden bg-fm-primary/10 text-fm-primary flex items-center justify-center flex-shrink-0 font-bold text-2xl">
            {c.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photo_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
              {displayName}
            </h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              {c.full_name}
              {age && ` · ${age}`}
              {c.school_name && ` · ${c.school_name}`}
              {c.school_grade && ` · ${c.school_grade}`}
            </p>
            {c.diagnoses_display_text && (
              <p className="text-sm text-fm-on-surface mt-2">{c.diagnoses_display_text}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {c.enrolled_program === 'blue_kids' && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-900">
                  BlueKids
                </span>
              )}
              {c.enrolled_program === 'learning_kids' && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-900">
                  LearningKids
                </span>
              )}
              {c.enrolled_program === 'aula_educativa' && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-900">
                  Aula educativa
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Calendario */}
        <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-4 md:p-6 overflow-hidden">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant px-2 mb-3">
            Calendario
          </h2>
          <ChildDashboardCalendar
            attendance={dashboardData.attendance}
            upcoming={dashboardData.upcoming}
            periodMonth={dashboardData.period_month}
            childName={c.full_name}
          />
        </section>

        {/* Próximas + Últimas sesiones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant mb-3">
              Próximas sesiones
            </h2>
            <AppointmentList appts={(futureAppts ?? []) as Appointment[]} empty="Sin citas próximas." />
          </section>
          <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant mb-3">
              Últimas sesiones
            </h2>
            <AppointmentList
              appts={(pastAppts ?? []) as Appointment[]}
              empty="Aún no hay sesiones registradas."
              past
            />
          </section>
        </div>

        {/* Plan de tratamiento — solo terapista */}
        {plan && ctx.appUser.role === 'terapista' && (
          <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant mb-3">
              Plan de tratamiento
            </h2>
            <TreatmentPlanSummary plan={plan as TreatmentPlan} />
          </section>
        )}

        {/* Informes cuatrimestrales */}
        <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant">
              Informes de avances
            </h2>
            {isBlueKids && (
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                BlueKids · informes no obligatorios
              </span>
            )}
          </div>
          {!progressReports || progressReports.length === 0 ? (
            <p className="text-sm text-fm-on-surface-variant italic">
              {isBlueKids
                ? 'Los niños del programa matutino BlueKids no requieren informes cuatrimestrales.'
                : 'Aún no se han creado informes para este niño.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {(progressReports as ProgressReport[]).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/familias/${c.family_id}/children/${c.id}/informe-avances/${r.id}`}
                    className="flex items-center justify-between rounded-xl border border-fm-outline-variant/20 hover:border-fm-primary/40 hover:bg-fm-primary/5 px-3 py-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fm-on-surface truncate">
                        {SERVICE_TYPE_LABELS[r.service_type as keyof typeof SERVICE_TYPE_LABELS] ?? r.service_type}
                      </p>
                      <p className="text-xs text-fm-on-surface-variant">
                        Período: {formatDate(r.period_starts)} – {formatDate(r.period_ends)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${reportStatusClass(r.status)}`}>
                      {REPORT_STATUS_LABEL[r.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reportes de sesión — con botón de "Llenar" / "Editar" para pendientes */}
        <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fm-on-surface-variant mb-3">
            Reportes de sesión
          </h2>
          {isBlueKids && (
            <p className="text-xs text-fm-on-surface-variant italic mb-3">
              BlueKids es programa matutino — no siempre se llenan reportes individuales.
            </p>
          )}
          <ChildSessionReportsHistory
            childId={childId}
            childName={displayName}
          />
        </section>

        {/* Agenda digital — bitácora compartida con la familia */}
        <section className="rounded-3xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5">
          <JournalTab childId={childId} childName={displayName} />
        </section>
      </div>
    </div>
  )
}

function AppointmentList({
  appts,
  empty,
  past = false,
}: {
  appts: Appointment[]
  empty: string
  past?: boolean
}) {
  if (appts.length === 0) {
    return <p className="text-sm text-fm-on-surface-variant italic">{empty}</p>
  }
  return (
    <ul className="space-y-2">
      {appts.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-fm-outline-variant/20 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fm-on-surface truncate">
              {a.service_type
                ? SERVICE_TYPE_LABELS[a.service_type] ?? a.service_type
                : 'Sesión'}
            </p>
            <p className="text-xs text-fm-on-surface-variant">
              {formatDateTime(a.starts_at)}
            </p>
          </div>
          {past && a.status === 'completed' ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-900">
              Completada
            </span>
          ) : a.status === 'no_show' || a.status === 'late_cancel' ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-fm-error/15 text-fm-error">
              Inasistencia
            </span>
          ) : a.status === 'replacement' ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-fm-tertiary text-white">
              Reposición
            </span>
          ) : a.status === 'rescheduled' ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-fm-on-surface-variant/70 text-white">
              Reagendada
            </span>
          ) : (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-fm-primary/10 text-fm-primary">
              Programada
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function TreatmentPlanSummary({ plan }: { plan: TreatmentPlan }) {
  const therapies = Array.isArray(plan.therapies_json)
    ? (plan.therapies_json as Array<{ service: string; active: boolean; sessions_per_month: number; unit_cost_usd: number }>)
    : []
  const activeTherapies = therapies.filter((t) => t.active)

  return (
    <div className="space-y-3 text-sm">
      {plan.diagnosis_text && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Diagnóstico</p>
          <p className="text-fm-on-surface mt-0.5">{plan.diagnosis_text}</p>
        </div>
      )}
      {activeTherapies.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1.5">Terapias activas</p>
          <div className="flex flex-wrap gap-1.5">
            {activeTherapies.map((t) => (
              <span
                key={t.service}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-fm-primary/10 text-fm-primary"
              >
                {SERVICE_TYPE_LABELS[t.service as keyof typeof SERVICE_TYPE_LABELS] ?? t.service}
                {' · '}
                {t.sessions_per_month}/mes
              </span>
            ))}
          </div>
        </div>
      )}
      {plan.observations && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant">Observaciones</p>
          <p className="text-fm-on-surface mt-0.5 whitespace-pre-wrap">{plan.observations}</p>
        </div>
      )}
    </div>
  )
}

function reportStatusClass(status: ProgressReport['status']): string {
  switch (status) {
    case 'draft': return 'bg-fm-surface-container text-fm-on-surface-variant'
    case 'submitted': return 'bg-blue-100 text-blue-900'
    case 'approved': return 'bg-emerald-100 text-emerald-900'
    case 'sent_to_family': return 'bg-emerald-100 text-emerald-900'
    case 'rejected': return 'bg-rose-100 text-rose-900'
  }
}

