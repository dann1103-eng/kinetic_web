interface Props {
  name: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
}

// Color determinístico a partir del nombre (mismo nombre → mismo color siempre)
const AVATAR_COLORS = [
  'bg-teal-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-indigo-500',
]

function colorForName(name: string): string {
  const code = (name.charCodeAt(0) ?? 0) + (name.charCodeAt(1) ?? 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase()
  return (name[0] ?? '?').toUpperCase()
}

export function ChildAvatar({ name, photoUrl, size = 'md' }: Props) {
  if (photoUrl) {
    return (
      <div className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden flex-shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex-shrink-0 flex items-center justify-center font-semibold text-white ${colorForName(name)}`}
    >
      {initials(name)}
    </div>
  )
}
