'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  userName: string
  avatarUrl: string | null
  canWork: boolean
  canBilling: boolean
}

const ALL_NAV_ITEMS = [
  { href: '/portal',              label: 'Inicio',   icon: 'home',        exact: true,  requiresWork: false, requiresBilling: false },
  { href: '/portal/agenda',       label: 'Citas',    icon: 'calendar_month', exact: false, requiresWork: true,  requiresBilling: false },
  { href: '/portal/agenda-digital', label: 'Reportes', icon: 'description', exact: false, requiresWork: true,  requiresBilling: false },
  { href: '/portal/facturas',     label: 'Facturas', icon: 'receipt_long', exact: false, requiresWork: false, requiresBilling: true  },
]

export function KineticPortalShell({ children, userName, avatarUrl, canWork, canBilling }: Props) {
  const pathname = usePathname()
  const firstName = userName.split(' ')[0]

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.requiresWork && !canWork) return false
    if (item.requiresBilling && !canBilling) return false
    return true
  })

  return (
    <div className="relative min-h-screen bg-fm-background">

      {/* ── Fixed header ── */}
      <header className="fixed top-0 w-full bg-fm-surface dark:bg-fm-surface-dim border-b border-fm-surface-container-highest dark:border-fm-outline-variant flex items-center justify-between px-4 h-16 z-50">
        <div className="flex items-center gap-3">

          {/* Avatar */}
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-kp-primary-container flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={userName}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-kp-primary-container flex items-center justify-center">
                <span className="text-sm font-bold text-kp-on-primary-container select-none">
                  {userName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Greeting */}
          <div>
            <p className="text-[18px] font-bold text-fm-on-surface leading-tight">
              ¡Hola {firstName}!
            </p>
            <p className="text-[12px] font-semibold tracking-[0.05em] text-fm-on-surface-variant uppercase">
              Portal de Padres
            </p>
          </div>
        </div>

        {/* Notifications bell */}
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-kp-primary/5 transition-colors"
          aria-label="Notificaciones"
        >
          <span className="material-symbols-outlined text-kp-primary">notifications</span>
        </button>
      </header>

      {/* ── Scrollable content ── */}
      <main className="relative z-10 pt-20 pb-32 px-4 flex flex-col gap-6">
        {children}
      </main>

      {/* ── Fixed bottom tab nav ── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-fm-surface-container-lowest dark:bg-fm-surface-container rounded-t-xl border-t border-fm-surface-container-highest dark:border-fm-outline-variant">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center px-5 py-1 rounded-full active:scale-95 transition-transform duration-150',
                isActive
                  ? 'bg-kp-primary-container dark:bg-kp-on-primary-fixed-variant text-kp-on-primary-container dark:text-kp-primary-fixed'
                  : 'text-fm-on-surface-variant hover:bg-fm-surface-container-high dark:hover:bg-fm-surface-container-highest',
              )}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-[12px] font-semibold tracking-[0.05em]">{item.label}</span>
            </Link>
          )
        })}
      </nav>

    </div>
  )
}
