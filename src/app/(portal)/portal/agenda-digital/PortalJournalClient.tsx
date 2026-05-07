'use client'

import { useState } from 'react'
import { ChildJournal } from '@/components/agenda/ChildJournal'
import type { ChildJournalEntry } from '@/types/db'

interface ChildData {
  id: string
  full_name: string
  preferred_name: string | null
}

interface PortalJournalClientProps {
  childrenData: ChildData[]
  entriesByChild: Record<string, ChildJournalEntry[]>
}

export function PortalJournalClient({
  childrenData,
  entriesByChild,
}: PortalJournalClientProps) {
  const [activeChildId, setActiveChildId] = useState(childrenData[0]?.id ?? null)

  if (childrenData.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-fm-on-surface-variant">
        No hay niños registrados.
      </div>
    )
  }

  const activeEntries = activeChildId ? (entriesByChild[activeChildId] ?? []) : []

  return (
    <div className="space-y-4">
      {childrenData.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {childrenData.map((child) => (
            <button
              key={child.id}
              onClick={() => setActiveChildId(child.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeChildId === child.id
                  ? 'bg-fm-primary text-white'
                  : 'border border-fm-outline-variant/40 text-fm-on-surface-variant hover:bg-fm-surface-container'
              }`}
            >
              {child.preferred_name ?? child.full_name}
            </button>
          ))}
        </div>
      )}

      {activeChildId && (
        <ChildJournal
          entries={activeEntries}
          childId={activeChildId}
          isFamily={true}
          canWrite={true}
        />
      )}
    </div>
  )
}
