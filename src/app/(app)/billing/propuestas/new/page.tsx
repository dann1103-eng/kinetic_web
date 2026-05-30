import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'
import {
  KineticInvoicePageClient,
  type InvoiceChildOption,
} from '@/components/billing/KineticInvoicePageClient'
import { listServiceCatalog } from '@/app/actions/service-catalog'
import type { MorningProgram, ServiceCatalogItem } from '@/types/db'

export const dynamic = 'force-dynamic'

// Mismos roles que el server action createAdHocQuote.
const ALLOWED_ROLES = ['admin', 'directora', 'coordinadora_terapias', 'recepcion', 'contable']

export default async function NewQuotePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: appUser } = await supabase
    .from('users')
    .select('role, can_quote')
    .eq('id', user.id)
    .single()
  const allowed = !!appUser && (ALLOWED_ROLES.includes(appUser.role) || appUser.can_quote === true)
  if (!allowed) redirect('/billing')

  const [catalogResult, { data: childrenRaw }] = await Promise.all([
    listServiceCatalog(),
    supabase
      .from('children')
      .select('id, full_name, family_id, enrolled_program, current_phase_code')
      .order('full_name'),
  ])

  const catalog: ServiceCatalogItem[] = catalogResult.ok ? catalogResult.data : []

  type ChildRow = {
    id: string
    full_name: string
    family_id: string
    enrolled_program: string | null
    current_phase_code: string | null
  }

  const activeChildren = ((childrenRaw ?? []) as ChildRow[]).filter(
    (c) => !c.current_phase_code || !c.current_phase_code.startsWith('5_'),
  )

  const familyIds = Array.from(new Set(activeChildren.map((c) => c.family_id)))
  const { data: famsRaw } = familyIds.length
    ? await supabase.from('families').select('id, primary_contact_name').in('id', familyIds)
    : { data: [] as { id: string; primary_contact_name: string | null }[] }
  const familyNameById = new Map(
    (famsRaw ?? []).map((f) => [f.id, f.primary_contact_name ?? '—']),
  )

  const children: InvoiceChildOption[] = activeChildren.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    family_id: c.family_id,
    family_name: familyNameById.get(c.family_id) ?? '—',
    enrolled_program: (c.enrolled_program as MorningProgram | null) ?? null,
  }))

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Nueva propuesta" />
      <div className="flex-1 p-6">
        <KineticInvoicePageClient childOptions={children} catalog={catalog} kind="quote" />
      </div>
    </div>
  )
}
