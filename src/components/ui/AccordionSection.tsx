interface AccordionSectionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  headerRight?: React.ReactNode
  children: React.ReactNode
}

/**
 * Sección colapsable con `<details>` nativo. Estilo glass-panel Kinetic.
 * Extraído del patrón de /reports para reuso en /reportes y otros lugares.
 */
export function AccordionSection({
  title,
  subtitle,
  defaultOpen = false,
  headerRight,
  children,
}: AccordionSectionProps) {
  return (
    <details
      className="glass-panel rounded-[2rem] overflow-hidden group"
      open={defaultOpen || undefined}
    >
      <summary className="px-8 py-5 cursor-pointer list-none flex items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-fm-on-surface truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="text-xs text-fm-on-surface-variant truncate">{subtitle}</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {headerRight}
          <span className="material-symbols-outlined text-fm-on-surface-variant transition-transform group-open:rotate-180">
            expand_more
          </span>
        </div>
      </summary>
      <div className="px-8 pb-8">{children}</div>
    </details>
  )
}
