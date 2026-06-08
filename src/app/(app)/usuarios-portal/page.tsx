import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { listAllFamilyUsers } from '@/app/actions/familyUsers'
import { UsuariosPortalClient } from './UsuariosPortalClient'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'directora', 'recepcion']

export default async function UsuariosPortalPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()

  const [portalUsers, { data: familiesRaw }] = await Promise.all([
    listAllFamilyUsers(),
    supabase
      .from('families')
      .select('id, primary_contact_name, primary_contact_email, status')
      .neq('status', 'dropped')
      .order('primary_contact_name'),
  ])

  const families = (familiesRaw ?? []) as {
    id: string
    primary_contact_name: string
    primary_contact_email: string | null
    status: string
  }[]

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Usuarios del portal" />
      <div className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        <UsuariosPortalClient initialUsers={portalUsers} families={families} />
      </div>
    </div>
  )
}
