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

  // Listado de familias con conteo de niños (vía agg subquery a children).
  const { data: families } = await supabase
    .from('families')
    .select('*')
    .order('primary_contact_name')

  // Conteo de niños por familia (Postgres RPC sería más limpio, pero hago una
  // segunda query y agrupo en TS por simplicidad — los volúmenes son chicos).
  const familyIds = (families ?? []).map((f) => f.id)
  const childrenCounts = new Map<string, number>()
  if (familyIds.length > 0) {
    const { data: childRows } = await supabase
      .from('children')
      .select('family_id')
      .in('family_id', familyIds)
    for (const row of childRows ?? []) {
      childrenCounts.set(row.family_id, (childrenCounts.get(row.family_id) ?? 0) + 1)
    }
  }

  const enriched = (families ?? []).map((f: Family) => ({
    ...f,
    children_count: childrenCounts.get(f.id) ?? 0,
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
