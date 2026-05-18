'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  userName: string
  avatarUrl: string | null
  canWork: boolean
  canBilling: boolean
}

const ALL_NAV_ITEMS = [
  { href: '/portal',                label: 'Inicio',   icon: 'home',           exact: true,  requiresWork: false, requiresBilling: false },
  // `exact: true` en Citas evita que /portal/agenda-digital active también
  // este tab (porque agenda-digital startsWith /portal/agenda).
  { href: '/portal/agenda',         label: 'Citas',    icon: 'calendar_month', exact: true,  requiresWork: true,  requiresBilling: false },
  { href: '/portal/agenda-digital', label: 'Reportes', icon: 'description',    exact: false, requiresWork: true,  requiresBilling: false },
  { href: '/portal/facturas',       label: 'Facturas', icon: 'receipt_long',   exact: false, requiresWork: false, requiresBilling: true  },
]

export function KineticPortalShell({
  children,
  userName,
  avatarUrl,
  canWork,
  canBilling,
}: Props) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const firstName = userName.split(' ')[0]
  const initials = userName.slice(0, 2).toUpperCase()
  const isDark = mounted && resolvedTheme === 'dark'

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.requiresWork && !canWork) return false
    if (item.requiresBilling && !canBilling) return false
    return true
  })

  // Plain JSX helper — called as renderAvatar('sm'), not <Avatar size="sm" />
  // to avoid React treating it as a new component type on every render.
  function renderAvatar(size: 'sm' | 'md') {
    const dim = size === 'sm' ? 36 : 40
    const cls = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm'
    return (
      <div className={`${cls} rounded-full overflow-hidden border-2 border-kp-primary-container flex-shrink-0`}>
        {avatarUrl ? (
          <Image src={avatarUrl} alt={userName} width={dim} height={dim} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-kp-primary-container flex items-center justify-center">
            <span className="font-bold text-kp-on-primary-container select-none">{initials}</span>
          </div>
        )}
      </div>
    )
  }

  // Compact dark/light mode toggle — icon only
  function renderThemeToggle(className?: string) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-full hover:bg-kp-primary/5 transition-colors',
          className,
        )}
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        suppressHydrationWarning
      >
        <span className="material-symbols-outlined text-fm-on-surface-variant">
          {isDark ? 'light_mode' : 'dark_mode'}
        </span>
      </button>
    )
  }

  return (
    <div className="relative min-h-screen bg-fm-background">

      {/* ── Background image ── */}
      <div
        className="fixed inset-0 z-0 portal-bg-image opacity-[0.07] md:opacity-20 pointer-events-none"
        aria-hidden="true"
      />

      {/* ── Mobile header (hidden md+) ── */}
      <header className="md:hidden fixed top-0 w-full bg-fm-surface/95 backdrop-blur-sm border-b border-fm-surface-container-highest flex items-center justify-between px-4 h-16 z-50">
        <div className="flex items-center gap-3">
          {renderAvatar('md')}
          <div>
            <p className="text-[18px] font-bold text-fm-on-surface leading-tight">
              ¡Hola {firstName}!
            </p>
            <p className="text-[12px] font-semibold tracking-[0.05em] text-fm-on-surface-variant uppercase">
              Portal de Padres
            </p>
          </div>
        </div>
        {/* Dark mode toggle (mobile) */}
        {renderThemeToggle()}
      </header>

      {/* ── Desktop sidebar (hidden below md) ── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 bg-fm-surface/95 backdrop-blur-sm border-r border-fm-outline-variant/30 flex-col z-50">

        {/* Brand mark */}
        <div className="px-6 pt-8 pb-5">
          <p className="text-[22px] font-black text-kp-primary tracking-tight">Kinetic</p>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-fm-on-surface-variant uppercase mt-0.5">
            Portal de Padres
          </p>
        </div>

        {/* User card */}
        <div className="mx-4 mb-5 p-3 rounded-2xl bg-kp-primary-container/10 flex items-center gap-3">
          {renderAvatar('sm')}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fm-on-surface truncate">{userName}</p>
            <p className="text-[11px] text-fm-on-surface-variant">Familia</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[14px] font-semibold transition-colors',
                  isActive
                    ? 'bg-kp-primary text-kp-on-primary'
                    : 'text-fm-on-surface-variant hover:bg-fm-surface-container-high',
                )}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-8 flex flex-col gap-1">
          <button
            type="button"
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[14px] font-semibold text-fm-on-surface-variant hover:bg-fm-surface-container-high transition-colors w-full text-left"
          >
            <span className="material-symbols-outlined text-[20px]">help_outline</span>
            Ayuda
          </button>
          <Link
            href="/auth/signout"
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[14px] font-semibold text-fm-on-surface-variant hover:bg-fm-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Cerrar sesión
          </Link>
        </div>
      </aside>

      {/* ── Desktop top app bar (hidden below md) ── */}
      <header className="hidden md:flex fixed top-0 left-64 right-0 h-20 bg-fm-surface/80 backdrop-blur-sm border-b border-fm-outline-variant/20 items-center justify-end px-10 z-40">
        {/* Actions: dark mode toggle + user chip */}
        <div className="flex items-center gap-2">
          {renderThemeToggle()}

          {/* User chip */}
          <div className="flex items-center gap-2 pl-3 border-l border-fm-outline-variant/30 ml-1">
            {renderAvatar('sm')}
            <span className="text-[14px] font-semibold text-fm-on-surface">{firstName}</span>
          </div>
        </div>
      </header>

      {/* ── Scrollable content area ── */}
      <main className="relative z-10 pt-20 pb-32 px-4 flex flex-col gap-6 md:ml-64 md:pt-28 md:px-10 md:pb-12 md:block md:gap-0">
        {children}
      </main>

      {/* ── Mobile bottom tab nav (hidden md+) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-fm-surface-container-lowest rounded-t-xl border-t border-fm-surface-container-highest">
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
                  ? 'bg-kp-primary-container text-kp-on-primary-container'
                  : 'text-fm-on-surface-variant hover:bg-fm-surface-container-high',
              )}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-[12px] font-semibold tracking-[0.05em]">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Desktop FAB (hidden below md) ── */}
      <button
        type="button"
        aria-label="Nueva acción"
        className="hidden md:flex fixed bottom-10 right-10 z-50 w-14 h-14 rounded-full bg-kp-primary text-kp-on-primary shadow-lg items-center justify-center hover:bg-kp-primary/90 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined">add</span>
      </button>

    </div>
  )
}
