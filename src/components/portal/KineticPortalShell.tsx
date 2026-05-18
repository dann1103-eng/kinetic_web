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

        {/* Brand mark — Kinetic Portal · Pediatric Care */}
        <div className="px-6 pt-8 pb-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-kp-primary-container/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-kp-primary text-[22px]">
              health_and_safety
            </span>
          </div>
          <div className="leading-tight">
            <p className="text-[20px] font-black text-fm-on-surface tracking-tight">Kinetic</p>
            <p className="text-[16px] font-bold text-kp-primary tracking-tight -mt-0.5">Portal</p>
            <p className="text-[10px] font-semibold tracking-[0.08em] text-fm-on-surface-variant uppercase mt-1">
              Pediatric Care
            </p>
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
          {/* form POST en vez de <Link>: si fuera Link, Next.js prefetchea el
              href en el render → /auth/signout se ejecuta solo y limpia las
              cookies sin que el usuario haga click. */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[14px] font-semibold text-fm-on-surface-variant hover:bg-fm-surface-container-high transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* ── Desktop top app bar (hidden below md) ── */}
      <header className="hidden md:flex fixed top-0 left-64 right-0 h-20 bg-fm-surface/80 backdrop-blur-sm border-b border-fm-outline-variant/20 items-center justify-between px-8 z-40 gap-4">
        {/* Search bar — UI only por ahora (sin búsqueda real conectada) */}
        <div className="flex-1 max-w-md">
          <label className="flex items-center gap-2 rounded-full bg-fm-surface-container-low/60 border border-fm-outline-variant/30 px-4 py-2 focus-within:border-kp-primary/40 focus-within:bg-fm-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-[18px] text-fm-on-surface-variant">search</span>
            <input
              type="search"
              placeholder="Buscar citas, reportes…"
              className="flex-1 bg-transparent text-sm text-fm-on-surface placeholder-fm-on-surface-variant focus:outline-none"
              aria-label="Buscar"
            />
          </label>
        </div>

        {/* Actions: dark mode + notifications + chat + user chip */}
        <div className="flex items-center gap-1">
          {renderThemeToggle()}

          <button
            type="button"
            className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-kp-primary/5 transition-colors"
            aria-label="Notificaciones"
          >
            <span className="material-symbols-outlined text-fm-on-surface-variant">notifications</span>
            {/* Punto de notificación — visible solo cuando hay notificaciones reales (TODO: wire) */}
            {/* <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-fm-error" /> */}
          </button>

          <Link
            href="/portal/agenda-digital"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-kp-primary/5 transition-colors"
            aria-label="Agenda digital"
            title="Ir a Agenda digital (conversación con el equipo)"
          >
            <span className="material-symbols-outlined text-fm-on-surface-variant">chat_bubble</span>
          </Link>

          {/* User chip con nombre completo + rol */}
          <div className="flex items-center gap-2.5 pl-3 ml-2 border-l border-fm-outline-variant/30">
            <div className="text-right leading-tight">
              <p className="text-[13px] font-bold text-fm-on-surface">{userName}</p>
              <p className="text-[11px] text-fm-on-surface-variant">Familia</p>
            </div>
            {renderAvatar('sm')}
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
