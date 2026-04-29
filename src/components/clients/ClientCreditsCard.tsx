import { CONTENT_TYPE_LABELS } from '@/lib/domain/plans'
import type { ContentType } from '@/types/db'

interface Props {
  cambios: number
  content: Partial<Record<ContentType, number>>
}

export function ClientCreditsCard({ cambios, content }: Props) {
  const contentEntries = Object.entries(content).filter(([, qty]) => (qty ?? 0) > 0) as [ContentType, number][]
  const total = cambios + contentEntries.reduce((s, [, q]) => s + q, 0)

  if (total === 0) return null

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-fm-primary text-xl">redeem</span>
        <h2 className="text-base font-semibold text-fm-on-surface">Créditos disponibles</h2>
        <span className="text-xs text-fm-on-surface-variant ml-1">— sin caducidad, se usan hasta agotarse</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cambios > 0 && (
          <div className="rounded-xl bg-fm-primary/5 border border-fm-primary/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-primary">Cambios extra</p>
            <p className="text-2xl font-bold text-fm-on-surface mt-1">{cambios}</p>
          </div>
        )}
        {contentEntries.map(([type, qty]) => (
          <div key={type} className="rounded-xl bg-fm-surface-container-low border border-fm-surface-container-high p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
              {CONTENT_TYPE_LABELS[type]}
            </p>
            <p className="text-2xl font-bold text-fm-on-surface mt-1">{qty}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
