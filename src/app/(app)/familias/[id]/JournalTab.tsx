import { createClient } from '@/lib/supabase/server'
import { ChildJournal } from '@/components/agenda/ChildJournal'
import type { ChildJournalEntry } from '@/types/db'

interface JournalTabProps {
  childId: string
  childName: string
}

export async function JournalTab({ childId, childName }: JournalTabProps) {
  const supabase = await createClient()

  const { data: entriesRaw } = await supabase
    .from('child_journal_entries')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })

  const entries = (entriesRaw ?? []) as ChildJournalEntry[]

  const authorIds = Array.from(
    new Set(entries.map((e) => e.author_user_id).filter(Boolean) as string[])
  )
  const { data: authorsRaw } = authorIds.length
    ? await supabase.from('users').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const authorNames = Object.fromEntries(
    (authorsRaw ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name])
  )

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fm-on-surface-variant">
        Agenda digital — {childName}
      </h3>
      <ChildJournal
        entries={entries}
        childId={childId}
        isFamily={false}
        canWrite={true}
        authorNames={authorNames}
      />
    </div>
  )
}
