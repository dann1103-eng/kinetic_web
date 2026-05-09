import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { FamilyForm } from '@/components/families/FamilyForm'
import { FamiliesTable } from '@/components/families/FamiliesTable'
import type { Family } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_TO_CREATE = ['admin', 'supervisor', 'directora', 'coordinadora_familias']

export default async function FamiliasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const role = ctx.appUser.role
  const canCreate = ALLOWED_TO_CREATE.includes(role)

  const supabase = await createClient()

  // Listado de familias con conteo de niños via PostgREST nested count
  // (una sola query, sin N+1).
  const { data: families } = await supabase
    .from('families')
    .select('*, children(count)')
    .order('primary_contact_name')

  type FamilyWithChildCount = Family & { children: { count: number }[] }
  const enriched = ((families ?? []) as unknown as FamilyWithChildCount[]).map((f) => ({
    ...f,
    children_count: f.children?.[0]?.count ?? 0,
  }))

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Familias" />

      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-fm-on-surface-variant">
            {enriched.length} familia{enriched.length !== 1 ? 's' : ''} registrada{enriched.length !== 1 ? 's' : ''}
          </p>
          {canCreate && <FamilyForm />}
        </div>

        <FamiliesTable families={enriched} />
      </div>
    </div>
  )
}
