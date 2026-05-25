import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listMyChildren } from '@/lib/domain/my-children'
import { SERVICE_TYPE_LABELS } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['terapista', 'maestra']

function formatAge(birth: string | null): string | null {
  if (!birth) return null
  const b = new Date(birth)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--
  return `${years} año${years === 1 ? '' : 's'}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default async function MisNinosPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()
  const cards = await listMyChildren(supabase, ctx.appUser.id, ctx.appUser.role)

  const roleLabel =
    ctx.appUser.role === 'maestra'
      ? 'Niños del programa matutino'
      : 'Niños bajo tu atención'

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Mis niños" />
      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-6xl mx-auto w-full">
        <header className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
            {roleLabel}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface mt-1">
            {cards.length} {cards.length === 1 ? 'niño' : 'niños'}
          </h1>
        </header>

        {cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 p-12 text-center">
            <span className="material-symbols-outlined text-fm-on-surface-variant text-4xl">
              child_care
            </span>
            <p className="mt-3 text-base font-semibold text-fm-on-surface">
              Aún no tenés niños asignados.
            </p>
            <p className="mt-1 text-sm text-fm-on-surface-variant max-w-md mx-auto">
              {ctx.appUser.role === 'maestra'
                ? 'Cuando recepción inscriba a un niño en el programa matutino aparecerá acá.'
                : 'La coordinadora te asignará niños cuando definan el plan de tratamiento.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(({ child, nextAppointment, lastCompletedAppointment }) => {
              const displayName = child.preferred_name ?? child.full_name
              const age = formatAge(child.birth_date)
              const initials = displayName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              const diagnosis =
                child.diagnoses_display_text ??
                (Array.isArray(child.diagnoses_json) && child.diagnoses_json.length > 0
                  ? (child.diagnoses_json as string[]).join(', ').replace(/_/g, ' ')
                  : null)

              return (
                <Link
                  key={child.id}
                  href={`/mis-ninos/${child.id}`}
                  className="group rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-5 hover:border-fm-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-fm-primary/10 text-fm-primary flex items-center justify-center flex-shrink-0 font-bold text-lg">
                      {child.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={child.photo_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-fm-on-surface leading-tight truncate group-hover:text-fm-primary transition-colors">
                        {displayName}
                      </h2>
                      <p className="text-xs text-fm-on-surface-variant truncate mt-0.5">
                        {age ? `${age} · ` : ''}
                        {child.full_name}
                      </p>
                      {child.enrolled_program === 'blue_kids' && (
                        <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                          BlueKids
                        </span>
                      )}
                      {child.enrolled_program === 'learning_kids' && (
                        <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                          LearningKids
                        </span>
                      )}
                      {child.enrolled_program === 'aula_educativa' && (
                        <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                          Aula educativa
                        </span>
                      )}
                    </div>
                  </div>

                  {diagnosis && (
                    <p className="mt-3 text-xs text-fm-on-surface-variant line-clamp-2">
                      {diagnosis}
                    </p>
                  )}

                  <div className="mt-4 space-y-1.5 text-xs">
                    {nextAppointment ? (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-fm-primary text-[16px]">
                          event
                        </span>
                        <span className="text-fm-on-surface">
                          <span className="font-semibold">Próxima:</span>{' '}
                          {formatDateTime(nextAppointment.starts_at)}
                          {nextAppointment.service_type && (
                            <span className="text-fm-on-surface-variant">
                              {' · '}
                              {SERVICE_TYPE_LABELS[nextAppointment.service_type] ??
                                nextAppointment.service_type}
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-fm-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px]">
                          event_busy
                        </span>
                        <span>Sin cita próxima programada.</span>
                      </div>
                    )}
                    {lastCompletedAppointment && (
                      <div className="flex items-center gap-2 text-fm-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px]">
                          history
                        </span>
                        <span>
                          Última: {formatDateTime(lastCompletedAppointment.starts_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
