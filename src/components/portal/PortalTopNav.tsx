'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Nav items — kept in sync with PortalSidebar
const navItems = [
  {
    href: '/portal/dashboard',
    label: 'Dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
      </svg>
    ),
  },
  {
    href: '/portal/pipeline',
    label: 'Pipeline',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
      </svg>
    ),
  },
  {
    href: '/portal/calendario',
    label: 'Calendario',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13zm-7-7h5v5h-5z"/>
      </svg>
    ),
  },
  {
    href: '/portal/facturacion',
    label: 'Facturación',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    ),
  },
  {
    href: '/portal/agenda-digital',
    label: 'Agenda digital',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>
      </svg>
    ),
  },
  {
    href: '/portal/empresa',
    label: 'Mi empresa',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
      </svg>
    ),
  },
  {
    href: '/portal/config',
    label: 'Configuración',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>
    ),
  },
]

const PATH_TITLES: Record<string, string> = {
  '/portal/dashboard':        'Dashboard',
  '/portal/pipeline':         'Pipeline',
  '/portal/calendario':       'Calendario',
  '/portal/facturacion':      'Facturación',
  '/portal/agenda-digital':   'Agenda digital',
  '/portal/empresa':          'Mi empresa',
  '/portal/config':           'Configuración',
}

function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true))
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-2 rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container-low transition-colors"
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      suppressHydrationWarning
    >
      <span className="material-symbols-outlined text-[22px]" suppressHydrationWarning>
        {mounted ? (isDark ? 'light_mode' : 'dark_mode') : 'dark_mode'}
      </span>
    </button>
  )
}

interface Props {
  clientDisplayName: string
}

export function PortalTopNav({ clientDisplayName }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const currentTitle = Object.entries(PATH_TITLES).find(([path]) =>
    path === '/portal/dashboard'
      ? pathname === path
      : pathname.startsWith(path)
  )?.[1] ?? 'Portal'

  return (
    <>
      <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-fm-surface-container-lowest border-b border-fm-outline-variant/30 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Hamburger — mobile only (sidebar hidden on mobile) */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden -ml-2 p-2 rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container-low transition-colors"
            aria-label="Abrir menú"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
          <h1 className="text-lg font-semibold text-fm-on-surface truncate">{currentTitle}</h1>
        </div>

        <DarkModeToggle />
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer panel */}
          <aside className="absolute inset-y-0 left-0 w-64 bg-fm-surface-container-lowest flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-fm-outline-variant/20 flex-shrink-0">
              <span className="font-bold text-fm-on-surface text-sm truncate">
                {clientDisplayName}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-fm-on-surface-variant hover:bg-fm-surface-container-low transition-colors"
                aria-label="Cerrar menú"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive =
                  item.href === '/portal/dashboard'
                    ? pathname === item.href
                    : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-fm-primary/10 text-fm-primary'
                        : 'text-fm-on-surface-variant hover:bg-fm-background hover:text-fm-on-surface'
                    )}
                  >
                    <span className={isActive ? 'text-fm-primary' : 'text-fm-outline'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Sign out */}
            <div className="px-3 pb-5 border-t border-fm-outline-variant/20 pt-3">
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-fm-error transition-all duration-150"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                  </svg>
                  Cerrar sesión
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
