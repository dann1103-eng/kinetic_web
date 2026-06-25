import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppUser } from '@/types/db'
import { UsersTable } from './UsersTable'
import { TopNav } from '@/components/layout/TopNav'

export default async function UsersPage() {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()
  if (!appUser || !['admin', 'directora', 'recepcion'].includes(appUser.role)) redirect('/')

  // Solo usuarios staff: excluir 'client' (FM legacy) y 'family' (portal Kinetic).
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at, avatar_url, default_assignee, can_quote, max_hours_per_week, monthly_salary_usd, professional_services_base_usd, hourly_rate_usd, contract_type, in_normal_payroll, in_professional_services_payroll, dui, isss_number, afp_number, afp_provider, hire_date')
    .not('role', 'in', '(client,family)')
    .order('full_name')

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Equipo" />
      <div className="p-6 max-w-6xl mx-auto w-full">
        <UsersTable
          users={(users ?? []) as AppUser[]}
          currentUserId={authUser.id}
          currentUserRole={appUser.role as AppUser['role']}
        />
      </div>
    </div>
  )
}
