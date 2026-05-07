import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { FamilyForm } from '@/components/families/FamilyForm'
import { ChildForm } from '@/components/families/ChildForm'
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

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title={familyTyped.primary_contact_name} backHref="/familias" />

      <div className="flex-1 p-6 space-y-6">
        {/* Header de familia */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-fm-on-surface">{familyTyped.primary_contact_name}</h1>
              <StatusBadge status={familyTyped.status} />
            </div>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              {familyTyped.primary_contact_email && <span>{familyTyped.primary_contact_email}</span>}
              {familyTyped.primary_contact_email && familyTyped.primary_contact_phone && <span> · </span>}
              {familyTyped.primary_contact_phone && <span>{familyTyped.primary_contact_phone}</span>}
            </p>
          </div>
          <FamilyForm initialFamily={familyTyped} />
        </div>

        {/* Datos de contacto + fiscales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard title="Contacto secundario">
            {familyTyped.secondary_contact_name ? (
              <>
                <div className="text-sm text-fm-on-surface">{familyTyped.secondary_contact_name}</div>
                <div className="text-xs text-fm-on-surface-variant">{familyTyped.secondary_contact_phone}</div>
              </>
            ) : (
              <span className="text-xs text-fm-on-surface-variant">No registrado</span>
            )}
          </InfoCard>

          <InfoCard title="Contacto de emergencia">
            {familyTyped.emergency_contact_name ? (
              <>
                <div className="text-sm text-fm-on-surface">{familyTyped.emergency_contact_name}</div>
                <div className="text-xs text-fm-on-surface-variant">
                  {familyTyped.emergency_contact_phone}
                  {familyTyped.emergency_contact_relation && ` · ${familyTyped.emergency_contact_relation}`}
                </div>
              </>
            ) : (
              <span className="text-xs text-fm-error">⚠️ Sin contacto de emergencia</span>
            )}
          </InfoCard>

          <InfoCard title="Datos fiscales">
            {familyTyped.fiscal_legal_name ? (
              <>
                <div className="text-sm text-fm-on-surface">{familyTyped.fiscal_legal_name}</div>
                <div className="text-xs text-fm-on-surface-variant">
                  {familyTyped.fiscal_nit && <>NIT {familyTyped.fiscal_nit}</>}
                  {familyTyped.fiscal_dui && !familyTyped.fiscal_nit && <>DUI {familyTyped.fiscal_dui}</>}
                </div>
              </>
            ) : (
              <span className="text-xs text-fm-on-surface-variant">No registrado</span>
            )}
          </InfoCard>
        </div>

        {/* Niños */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fm-on-surface">
              Niños/as ({childrenList.length})
            </h2>
            <ChildForm familyId={id} />
          </div>

          {childrenList.length === 0 && (
            <div className="text-sm text-fm-on-surface-variant py-8 text-center bg-fm-surface-container-low rounded-2xl border border-fm-outline-variant/20">
              Esta familia aún no tiene niños/as registrados.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {childrenList.map((child) => (
              <ChildCard key={child.id} familyId={id} child={child} />
            ))}
          </div>
        </div>

        {/* Notas internas */}
        {familyTyped.notes && (
          <div className="bg-fm-surface-container-low rounded-2xl border border-fm-outline-variant/20 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-2">Notas internas</h3>
            <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{familyTyped.notes}</p>
          </div>
        )}
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
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-fm-surface-container'}`}>
      {FAMILY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-fm-surface-container-low rounded-2xl border border-fm-outline-variant/20 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  )
}

function ChildCard({ familyId, child }: { familyId: string; child: Child }) {
  const ageYears = child.birth_date
    ? Math.floor((new Date().getTime() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <Link
      href={`/familias/${familyId}/children/${child.id}`}
      className="block bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 hover:border-fm-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fm-on-surface">{child.full_name}</h3>
            {child.code && <span className="text-[10px] font-mono text-fm-on-surface-variant bg-fm-surface-container px-1.5 py-0.5 rounded">{child.code}</span>}
          </div>
          {child.preferred_name && <p className="text-xs text-fm-on-surface-variant">&ldquo;{child.preferred_name}&rdquo;</p>}
          <p className="text-xs text-fm-on-surface-variant mt-1">
            {ageYears !== null ? `${ageYears} años` : 'Sin fecha de nacimiento'}
            {child.school_name && ` · ${child.school_name}`}
            {child.school_grade && ` (${child.school_grade})`}
          </p>
        </div>
        <span className="material-symbols-outlined text-fm-on-surface-variant">chevron_right</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {child.enrolled_program && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-secondary/15 text-fm-secondary">
            {MORNING_PROGRAM_LABELS[child.enrolled_program]}
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary">
          {INTAKE_PHASE_LABELS[child.intake_phase]}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
          {TREATMENT_STATUS_LABELS[child.treatment_status]}
        </span>
      </div>

      {child.diagnoses_display_text && (
        <p className="text-xs text-fm-on-surface-variant mt-2 italic">{child.diagnoses_display_text}</p>
      )}
    </Link>
  )
}
