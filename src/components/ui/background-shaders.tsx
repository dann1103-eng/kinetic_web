import { cn } from '@/lib/utils'

interface LoginBackgroundProps {
  className?: string
  gradientFrom?: string
  gradientTo?: string
  gradientSize?: string
  gradientPosition?: string
  gradientStop?: string
}

export function LoginBackground({
  className,
  gradientFrom = '#fff',
  gradientTo = '#63e',
  gradientSize = '125% 125%',
  gradientPosition = '50% 10%',
  gradientStop = '40%',
}: LoginBackgroundProps) {
  return (
    <div
      className={cn('fixed inset-0 w-full h-full -z-10 bg-white', className)}
      style={{
        background: `radial-gradient(${gradientSize} at ${gradientPosition}, ${gradientFrom} ${gradientStop}, ${gradientTo} 100%)`,
      }}
      aria-hidden="true"
    />
  )
}

// Compat: re-export con el nombre viejo para callers legacy.
export const BackgroundShader = LoginBackground
