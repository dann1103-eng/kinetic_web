import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { PortalJournalClient } from './PortalJournalClient'
import type { ChildJournalEntry } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function PortalAgendaDigitalPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  const { data: familyUserRaw } = await supabase
    .from('family_users')
    .select('can_work')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()
  const familyUser = familyUserRaw as { can_work: boolean } | null

  if (!familyUser?.can_work) {
    return (
      <div className="flex flex-col min-h-full bg-fm-background">
        <TopNav title="Agenda digital" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-fm-on-surface-variant text-center max-w-xs">
            El acceso a la Agenda digital no está habilitado para esta cuenta.
            Contactá a Kinetic si creés que esto es un error.
          </p>
        </div>
      </div>
    )
  }

  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')

  const children = (childrenRaw ?? []) as {
    id: string
    full_name: string
    preferred_name: string | null
  }[]

  const childIds = children.map((c) => c.id)
  const entriesByChild: Record<string, ChildJournalEntry[]> = {}

  if (childIds.length > 0) {
    const { data: entriesRaw } = await supabase
      .from('child_journal_entries')
      .select('*')
      .in('child_id', childIds)
      .order('created_at', { ascending: false })

    for (const e of (entriesRaw ?? []) as ChildJournalEntry[]) {
      if (!entriesByChild[e.child_id]) entriesByChild[e.child_id] = []
      entriesByChild[e.child_id].push(e)
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Agenda digital" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">
        <PortalJournalClient
          childrenData={children}
          entriesByChild={entriesByChild}
        />
      </div>
    </div>
  )
}
