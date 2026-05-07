import type { ChildJournalEntry } from '@/types/db'
import { JournalEntryList } from './JournalEntryList'
import { JournalEntryComposer } from './JournalEntryComposer'

interface ChildJournalProps {
  entries: ChildJournalEntry[]
  childId: string
  isFamily: boolean
  canWrite: boolean
  linkedAppointmentId?: string
  authorNames?: Record<string, string>
}

export function ChildJournal({
  entries,
  childId,
  isFamily,
  canWrite,
  linkedAppointmentId,
  authorNames,
}: ChildJournalProps) {
  return (
    <div className="space-y-6">
      {canWrite && (
        <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-3">
            Nueva entrada
          </p>
          <JournalEntryComposer
            childId={childId}
            isFamily={isFamily}
            linkedAppointmentId={linkedAppointmentId}
          />
        </div>
      )}
      <JournalEntryList entries={entries} isFamily={isFamily} authorNames={authorNames} />
    </div>
  )
}
