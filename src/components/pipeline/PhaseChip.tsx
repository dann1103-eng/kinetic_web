import { PHASE_GROUP_COLORS } from '@/types/db'
import type { IntakePhaseCatalogEntry, PhaseGroupNumber } from '@/types/db'

interface Props {
  phase: IntakePhaseCatalogEntry | null | undefined
  /** Texto fallback si no hay phase. */
  fallback?: string
  size?: 'sm' | 'md'
}

/**
 * Chip estandarizado de fase del pipeline. Color del fondo y texto deriva
 * de PHASE_GROUP_COLORS según el group_number de la fase.
 */
export function PhaseChip({ phase, fallback = '—', size = 'sm' }: Props) {
  if (!phase) {
    return (
      <span className="text-xs italic text-fm-on-surface-variant">{fallback}</span>
    )
  }
  const palette =
    PHASE_GROUP_COLORS[phase.group_number as PhaseGroupNumber] ??
    PHASE_GROUP_COLORS[1]
  const sizeCls = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider rounded-full ${palette.bg} ${palette.text} ${sizeCls}`}
      title={phase.description ?? phase.label}
    >
      <span className="font-mono text-[10px] opacity-70">
        {phase.group_number}.{phase.sub_order}
      </span>
      {phase.label}
    </span>
  )
}
