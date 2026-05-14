import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { FamilyForm } from '@/components/families/FamilyForm'
import { ChildForm } from '@/components/families/ChildForm'
import { JournalTab } from './JournalTab'
import { FamilyInvoicesSection } from '@/components/families/FamilyInvoicesSection'
import {
  INTAKE_PHASE_LABELS,
  TREATMENT_STATUS_LABELS,
  MORNING_PROGRAM_LABELS,
} from '@/types/db'
import type { Family, Child } from '@/types/db'

export const dynamic = 'force-dynamic'

const FAMILY_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  paused: 'Pausada',
  overdue: 'Morosa',
  dropped: 'Baja',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FamiliaDetallePage({ params }: PageProps) {
  const { id } = await params
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()
  const { data: family, error } = await supabase
    .from('families')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !family) notFound()

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .eq('family_id', id)
    .order('full_name')

  const childrenList = (children ?? []) as Child[]
  const familyTyped = family as Family

  const hasEmergency = !!familyTyped.emergency_contact_name
  const hasSecondary = !!familyTyped.secondary_contact_name
  const hasFiscal = !!familyTyped.fiscal_legal_name

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={familyTyped.primary_contact_name} backHref="/familias" />

      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-[1280px] mx-auto w-full">
        {/* Editorial header: jerarquia por escala tipografica + accion derecha */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
              Familia
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fm-on-surface leading-none">
                {familyTyped.primary_contact_name}
              </h1>
              <StatusBadge status={familyTyped.status} />
            </div>
            {(familyTyped.primary_contact_email || familyTyped.primary_contact_phone) && (
              <p className="text-sm text-fm-on-surface-variant">
                {familyTyped.primary_contact_email && (
                  <span>{familyTyped.primary_contact_email}</span>
                )}
                {familyTyped.primary_contact_email && familyTyped.primary_contact_phone && (
                  <span className="mx-2 text-fm-outline-variant">·</span>
                )}
                {familyTyped.primary_contact_phone && (
                  <span>{familyTyped.primary_contact_phone}</span>
                )}
              </p>
            )}
          </div>
          <FamilyForm initialFamily={familyTyped} />
        </header>

        {/* Layout principal: rail de identidad (5/12) + contenido (7/12) */}
        <div className="grid grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* RAIL IZQUIERDO: identidad + emergencia + fiscal */}
          <aside className="col-span-12 lg:col-span-5 lg:sticky lg:top-6 space-y-10">
            {/* Emergencia: el bloque mas importante, sin nada que distraiga */}
            <section
              aria-labelledby="emergency-heading"
              className={
                hasEmergency
                  ? 'rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-6'
                  : 'rounded-3xl border border-fm-error/40 bg-fm-error/5 p-6'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                  Contacto de emergencia
                </p>
                {!hasEmergency && (
                  <span
                    className="material-symbols-outlined text-fm-error"
                    aria-hidden="true"
                  >
                    warning
                  </span>
                )}
              </div>
              {hasEmergency ? (
                <div className="mt-4 space-y-1">
                  <h2
                    id="emergency-heading"
                    className="text-2xl font-semibold text-fm-on-surface leading-tight"
                  >
                    {familyTyped.emergency_contact_name}
                  </h2>
                  <p className="text-base text-fm-on-surface-variant">
                    {familyTyped.emergency_contact_phone}
                    {familyTyped.emergency_contact_relation && (
                      <span className="text-fm-on-surface-variant/70">
                        {' · '}
                        {familyTyped.emergency_contact_relation}
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <h2
                    id="emergency-heading"
                    className="text-base font-semibold text-fm-error"
                  >
                    Sin contacto de emergencia registrado
                  </h2>
                  <p className="text-xs text-fm-error/80 max-w-prose">
                    En caso de accidente o malestar, Kinetic necesita un segundo
                    contacto al que llamar si no se localiza al padre/madre.
                  </p>
                </div>
              )}
            </section>

            {/* Datos secundarios y fiscales: definitions con dividers, sin card anidada */}
            <section
              aria-label="Datos complementarios"
              className="space-y-6 px-1"
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                  Contacto secundario
                </p>
                {hasSecondary ? (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-base text-fm-on-surface">
                      {familyTyped.secondary_contact_name}
                    </p>
                    <p className="text-sm text-fm-on-surface-variant">
                      {familyTyped.secondary_contact_phone}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-fm-on-surface-variant/70">
                    Sin segundo padre/tutor en contacto.
                  </p>
                )}
              </div>

              <div className="border-t border-fm-outline-variant/20 pt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                  Datos fiscales
                </p>
                {hasFiscal ? (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-base text-fm-on-surface">
                      {familyTyped.fiscal_legal_name}
                    </p>
                    <p className="text-sm text-fm-on-surface-variant">
                      {familyTyped.fiscal_nit && <>NIT {familyTyped.fiscal_nit}</>}
                      {familyTyped.fiscal_dui && !familyTyped.fiscal_nit && (
                        <>DUI {familyTyped.fiscal_dui}</>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-fm-on-surface-variant/70">
                    Necesarios para emitir factura.
                  </p>
                )}
              </div>

              {familyTyped.notes && (
                <div className="border-t border-fm-outline-variant/20 pt-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                    Notas internas
                  </p>
                  <p className="mt-2 text-sm text-fm-on-surface whitespace-pre-wrap max-w-prose">
                    {familyTyped.notes}
                  </p>
                </div>
              )}
            </section>
          </aside>

          {/* CONTENIDO DERECHO: niños + agenda */}
          <main className="col-span-12 lg:col-span-7 space-y-16">
            {/* Niños */}
            <section className="space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                    Expedientes
                  </p>
                  <h2 className="text-2xl font-semibold text-fm-on-surface">
                    Niños
                    <span className="ml-2 text-fm-on-surface-variant font-normal tabular-nums">
                      {childrenList.length}
                    </span>
                  </h2>
                </div>
                <ChildForm familyId={id} />
              </div>

              {childrenList.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 px-8 py-14 text-center">
                  <p className="text-sm font-semibold text-fm-on-surface">
                    Esta familia aún no tiene niños/as registrados.
                  </p>
                  <p className="text-xs text-fm-on-surface-variant mt-2 max-w-prose mx-auto">
                    Hacé clic en{' '}
                    <span className="font-semibold text-fm-on-surface">
                      Registrar niño/a
                    </span>{' '}
                    arriba para crear el primer expediente clínico.
                  </p>
                </div>
              ) : childrenList.length === 1 ? (
                <ChildHeroCard familyId={id} child={childrenList[0]} />
              ) : (
                <div className="space-y-3">
                  <ChildHeroCard familyId={id} child={childrenList[0]} />
                  {childrenList.slice(1).map((child) => (
                    <ChildRow key={child.id} familyId={id} child={child} />
                  ))}
                </div>
              )}
            </section>

            {/* Historial de facturas */}
            {childrenList.length > 0 && (
              <FamilyInvoicesSection familyId={id} />
            )}

            {/* Agenda digital — sin card anidada, divider + heading */}
            {childrenList.length > 0 && (
              <section className="space-y-8">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
                    Bitácora compartida
                  </p>
                  <h2 className="text-2xl font-semibold text-fm-on-surface">
                    Agenda digital
                  </h2>
                </div>
                <div className="space-y-10 divide-y divide-fm-outline-variant/20">
                  {childrenList.map((child, idx) => (
                    <div
                      key={child.id}
                      className={idx === 0 ? '' : 'pt-10'}
                    >
                      <JournalTab
                        childId={child.id}
                        childName={child.preferred_name ?? child.full_name}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-fm-tertiary/15 text-fm-tertiary',
    paused: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
    overdue: 'bg-fm-error/10 text-fm-error',
    dropped: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  }
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${colors[status] ?? 'bg-fm-surface-container'}`}
    >
      {FAMILY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function childAgeYears(birth: string | null): number | null {
  if (!birth) return null
  return Math.floor(
    (new Date().getTime() - new Date(birth).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
  )
}

function ChildHeroCard({ familyId, child }: { familyId: string; child: Child }) {
  const age = childAgeYears(child.birth_date)

  return (
    <Link
      href={`/familias/${familyId}/children/${child.id}`}
      className="group block rounded-3xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-6 md:p-8 hover:border-fm-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl md:text-2xl font-semibold text-fm-on-surface leading-tight">
              {child.full_name}
            </h3>
            {child.code && (
              <span className="text-[10px] font-mono text-fm-on-surface-variant bg-fm-surface-container px-1.5 py-0.5 rounded">
                {child.code}
              </span>
            )}
          </div>
          {child.preferred_name && (
            <p className="text-sm text-fm-on-surface-variant">
              &ldquo;{child.preferred_name}&rdquo;
            </p>
          )}
          <p className="text-sm text-fm-on-surface-variant">
            {age !== null ? `${age} años` : 'Sin fecha de nacimiento'}
            {child.school_name && ` · ${child.school_name}`}
            {child.school_grade && ` (${child.school_grade})`}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-fm-on-surface-variant group-hover:text-fm-primary transition-colors"
          aria-hidden="true"
        >
          arrow_outward
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        {child.enrolled_program && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-fm-secondary/15 text-fm-secondary">
            {MORNING_PROGRAM_LABELS[child.enrolled_program]}
          </span>
        )}
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-fm-primary/10 text-fm-primary">
          {INTAKE_PHASE_LABELS[child.intake_phase]}
        </span>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
          {TREATMENT_STATUS_LABELS[child.treatment_status]}
        </span>
      </div>

      {child.diagnoses_display_text && (
        <p className="text-sm text-fm-on-surface-variant mt-4 italic max-w-prose">
          {child.diagnoses_display_text}
        </p>
      )}
    </Link>
  )
}

function ChildRow({ familyId, child }: { familyId: string; child: Child }) {
  const age = childAgeYears(child.birth_date)

  return (
    <Link
      href={`/familias/${familyId}/children/${child.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-fm-outline-variant/15 bg-fm-surface-container-lowest px-5 py-4 hover:border-fm-primary/40 hover:bg-fm-surface-container-low/50 transition-all"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-fm-on-surface truncate">
            {child.full_name}
          </h3>
          {child.code && (
            <span className="text-[10px] font-mono text-fm-on-surface-variant bg-fm-surface-container px-1.5 py-0.5 rounded">
              {child.code}
            </span>
          )}
        </div>
        <p className="text-xs text-fm-on-surface-variant truncate mt-0.5">
          {age !== null ? `${age} años` : 'Sin fecha de nacimiento'}
          {child.school_name && ` · ${child.school_name}`}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary">
          {INTAKE_PHASE_LABELS[child.intake_phase]}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
          {TREATMENT_STATUS_LABELS[child.treatment_status]}
        </span>
      </div>
      <span
        className="material-symbols-outlined text-fm-on-surface-variant group-hover:text-fm-primary transition-colors shrink-0"
        aria-hidden="true"
      >
        chevron_right
      </span>
    </Link>
  )
}
