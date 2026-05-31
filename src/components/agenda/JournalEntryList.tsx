import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { toggleJournalEntryVisibilityAction } from '@/app/actions/child-journal'
import type { ChildJournalEntry } from '@/types/db'

interface JournalEntryListProps {
  entries: ChildJournalEntry[]
  isFamily: boolean
  authorNames?: Record<string, string>
}

const CATEGORY_CONFIG = {
  home_exercise: { label: 'Ejercicio', dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400' },
  observation:   { label: 'Observación', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
  question:      { label: 'Pregunta',   dot: 'bg-yellow-500',text: 'text-yellow-700 dark:text-yellow-400' },
  response:      { label: 'Respuesta',  dot: 'bg-gray-400',  text: 'text-gray-600 dark:text-gray-400' },
} as const

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

function groupByDay(entries: ChildJournalEntry[]) {
  const map = new Map<string, ChildJournalEntry[]>()
  for (const e of entries) {
    const day = e.created_at.slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(e)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, dayEntries]) => dayEntries)
}

export function JournalEntryList({ entries, isFamily, authorNames = {} }: JournalEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-fm-on-surface-variant">
        No hay entradas aún.
      </div>
    )
  }

  const groups = groupByDay(entries)

  return (
    <div className="space-y-6">
      {groups.map((dayEntries) => (
        <div key={dayEntries[0].created_at.slice(0, 10)}>
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-3 capitalize">
            {dayLabel(dayEntries[0].created_at)}
          </p>
          <div className="space-y-3">
            {dayEntries.map((entry) => {
              const cat = CATEGORY_CONFIG[entry.category]
              const authorName = entry.author_user_id ? authorNames[entry.author_user_id] : null
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block w-2 h-2 rounded-full ${cat.dot}`} />
                    <span className={`text-xs font-semibold ${cat.text}`}>{cat.label}</span>
                    {!isFamily && !entry.visible_to_family && (
                      <span className="text-[10px] font-medium bg-fm-on-surface/8 text-fm-on-surface-variant px-2 py-0.5 rounded-full">
                        Solo interno
                      </span>
                    )}
                    {authorName && (
                      <span className="text-xs text-fm-on-surface-variant ml-auto">
                        {authorName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{entry.body}</p>
                  {!isFamily && (
                    <form action={toggleJournalEntryVisibilityAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <button
                        type="submit"
                        className="text-xs text-fm-primary hover:underline"
                      >
                        {entry.visible_to_family ? 'Ocultar para la familia' : 'Mostrar para la familia'}
                      </button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
