import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'
import { listAllClientUsers } from '@/app/actions/clientUsers'
import { PortalUsersClient } from './PortalUsersClient'

export const dynamic = 'force-dynamic'

export default async function PortalUsersPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()
  if (appUser?.role !== 'admin') redirect('/')

  const [portalUsers, { data: clientsRaw }] = await Promise.all([
    listAllClientUsers(),
    supabase.from('clients').select('id, name').order('name'),
  ])

  const clients = (clientsRaw ?? []).map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Usuarios del portal" />
      <div className="p-6 max-w-5xl mx-auto w-full">
        <PortalUsersClient initialUsers={portalUsers} clients={clients} />
      </div>
    </div>
  )
}
