import { redirect } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'
import { listGroups } from '@/app/actions/program-groups'
import { GruposClient } from './GruposClient'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_terapias',
  'coordinadora_familias',
  'recepcion',
]

export default async function GruposPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()
  const [groups, { data: staffUsers }] = await Promise.all([
    listGroups(),
    supabase
      .from('users')
      .select('id, full_name, role')
      .in('role', [
        'terapista',
        'maestra',
        'directora',
        'admin',
        'coordinadora_terapias',
        'coordinadora_familias',
      ])
      .order('full_name'),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Grupos matutinos" />
      <div className="flex-1 p-4 sm:p-6">
        <GruposClient initialGroups={groups} staffUsers={staffUsers ?? []} />
      </div>
    </div>
  )
}
