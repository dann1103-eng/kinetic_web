'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useUser } from '@/contexts/UserContext'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useInboxList } from '@/hooks/useInboxPolling'
import type { UserRole } from '@/types/db'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badgeKey?: 'inbox'
  allowedRoles?: UserRole[]
}

const ADMIN_ROLES: UserRole[] = ['admin', 'directora']

// ── Main top-level nav ────────────────────────────────────────────────────

const topNavItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
      </svg>
    ),
  },
  {
    href: '/familias',
    label: 'Familias',
    // Terapistas y maestras NO ven familias — usan /mis-ninos
    allowedRoles: ['admin', 'directora', 'supervisor', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion', 'contable'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58A2.01 2.01 0 0 0 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0 0 20 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
      </svg>
    ),
  },
  {
    href: '/ninos',
    label: 'Niños',
    // Terapistas y maestras NO ven todos los niños — usan /mis-ninos
    allowedRoles: ['admin', 'directora', 'supervisor', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion', 'contable'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>child_care</span>
    ),
  },
  {
    href: '/mis-ninos',
    label: 'Mis niños',
    allowedRoles: ['terapista', 'maestra'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>diversity_3</span>
    ),
  },
  {
    href: '/mi-dia',
    label: 'Mi día',
    allowedRoles: ['terapista', 'maestra'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>calendar_today</span>
    ),
  },
  {
    href: '/agenda',
    label: 'Agenda',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM7 12h5v5H7z"/>
      </svg>
    ),
  },
  {
    href: '/aprobaciones',
    label: 'Aprobaciones',
    allowedRoles: ['directora', 'admin'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>check_circle</span>
    ),
  },
  {
    href: '/operacion/lista-de-espera',
    label: 'Lista espera',
    allowedRoles: ['admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>hourglass_top</span>
    ),
  },
  {
    href: '/inbox',
    label: 'Equipo',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/>
      </svg>
    ),
    badgeKey: 'inbox',
  },
  {
    href: '/tiempo',
    label: 'Tiempo',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
      </svg>
    ),
  },
  {
    href: '/mis-recibos',
    label: 'Mis recibos',
    allowedRoles: [
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion', 'contable',
    ],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>receipt_long</span>
    ),
  },
]

// ── Items only shown at top-level for non-admin/directora ─────────────────

const facturacionItem: NavItem = {
  href: '/billing',
  label: 'Facturación',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
    </svg>
  ),
}

// ── Administración group items ─────────────────────────────────────────────
// El grupo se muestra si AL MENOS UN item es visible al usuario actual.
// Cada item respeta su propio `allowedRoles`.

const adminGroupItems: NavItem[] = [
  {
    href: '/users',
    label: 'Usuarios',
    allowedRoles: ['admin', 'directora'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
      </svg>
    ),
  },
  {
    href: '/usuarios-portal',
    label: 'Usuarios portal',
    allowedRoles: ['admin', 'directora'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 13c-2.4 0-4.55-1.18-5.85-3 .03-1.99 4-3.08 5.85-3.08 1.84 0 5.82 1.09 5.85 3.08-1.3 1.82-3.45 3-5.85 3z"/>
      </svg>
    ),
  },
  {
    href: '/operacion/capacidad-terapistas',
    label: 'Capacidad equipo',
    allowedRoles: ['admin', 'directora', 'coordinadora_terapias', 'recepcion'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>monitoring</span>
    ),
  },
  {
    href: '/reportes',
    label: 'Reportes',
    allowedRoles: ['admin', 'directora', 'contable', 'recepcion', 'coordinadora_terapias'],
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>summarize</span>
    ),
  },
  {
    href: '/billing',
    label: 'Facturación',
    allowedRoles: ['admin', 'directora', 'recepcion'],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    ),
  },
]

// ── Sidebar props ─────────────────────────────────────────────────────────

interface SidebarProps {
  agencyLogoUrl?: string | null
}

// ── SidebarContent ────────────────────────────────────────────────────────

export function SidebarContent({
  agencyLogoUrl,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const user = useUser()
  const [logoError, setLogoError] = useState(false)
  const { data: inboxList } = useInboxList()
  const inboxUnread = inboxList.reduce((sum, c) => sum + c.unread_count, 0)

  const isAdminOrDirectora = ADMIN_ROLES.includes(user.role as UserRole)

  // Filter admin group items by role; group shows if ≥1 item is visible.
  const visibleAdminItems = adminGroupItems.filter((item) => {
    if (!item.allowedRoles) return true
    return item.allowedRoles.includes(user.role)
  })
  const showAdminGroup = visibleAdminItems.length > 0

  // Auto-open admin group if a child route is active (estado derivado, no efecto).
  const adminRouteActive = useMemo(
    () => visibleAdminItems.some((item) => pathname.startsWith(item.href)),
    [pathname, visibleAdminItems],
  )
  // Permite abrir/cerrar manualmente; se resetea implícitamente con adminRouteActive.
  const [adminGroupManualOpen, setAdminGroupManualOpen] = useState(false)
  const adminGroupOpen = adminRouteActive || adminGroupManualOpen

  // Filter top-level items by role
  const visibleTopItems = topNavItems.filter((item) => {
    if (!item.allowedRoles) return true
    return item.allowedRoles.includes(user.role)
  })

  function renderNavItem(item: NavItem, indent?: boolean) {
    const isActive =
      item.href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(item.href)

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
          indent && 'pl-5',
          isActive
            ? 'bg-fm-primary/10 text-fm-primary'
            : 'text-fm-on-surface-variant hover:bg-fm-background hover:text-fm-on-surface',
        )}
      >
        <span className={isActive ? 'text-fm-primary' : 'text-fm-outline'}>
          {item.icon}
        </span>
        <span>{item.label}</span>
        {item.badgeKey === 'inbox' && inboxUnread > 0 && (
          <span className="ml-auto bg-fm-error text-white text-xs font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {inboxUnread > 99 ? '99+' : inboxUnread}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-fm-outline-variant/20">
        <div
          className={`w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center ${
            agencyLogoUrl && !logoError ? '' : 'signature-gradient'
          }`}
        >
          {agencyLogoUrl && !logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agencyLogoUrl}
              alt="Kinetic"
              className="w-full h-full object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <span className="text-white font-bold text-sm">K</span>
          )}
        </div>
        <div>
          <p className="font-bold text-fm-on-surface text-sm leading-tight">Kinetic</p>
          <p className="text-fm-on-surface-variant text-xs">muévete y aprende</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Top-level items */}
        {visibleTopItems.map((item) => renderNavItem(item))}

        {/* Facturación fallback for can_quote non-admins */}
        {!isAdminOrDirectora && user.can_quote && renderNavItem(facturacionItem)}

        {/* ── Administración group ── */}
        {showAdminGroup && (
          <div className="mt-1">
            <div className="my-2 border-t border-fm-outline-variant/15" />

            <button
              onClick={() => setAdminGroupManualOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant hover:bg-fm-background transition-colors"
            >
              <span className={cn(
                'material-symbols-outlined',
                visibleAdminItems.some((i) => pathname.startsWith(i.href))
                  ? 'text-fm-primary'
                  : 'text-fm-outline',
              )} style={{ fontSize: '20px' }}>
                admin_panel_settings
              </span>
              <span className="flex-1 text-left">Administración</span>
              <span
                className="material-symbols-outlined text-base transition-transform duration-200"
                style={{ transform: adminGroupOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
            </button>

            {adminGroupOpen && (
              <div className="mt-0.5 space-y-0.5">
                {visibleAdminItems.map((item) => renderNavItem(item, true))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 border-t border-fm-outline-variant/20 pt-3 space-y-0.5">
        <Link
          href="/profile"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150',
            pathname === '/profile'
              ? 'bg-fm-primary/10'
              : 'hover:bg-fm-background',
          )}
        >
          <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-fm-on-surface truncate">{user.full_name}</p>
            <p className="text-xs text-fm-outline-variant capitalize">{user.role}</p>
          </div>
        </Link>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-red-50 hover:text-fm-error transition-all duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-64 hidden md:flex flex-col bg-fm-surface-container-lowest border-r border-fm-outline-variant/30 shadow-sm">
      <SidebarContent {...props} />
    </aside>
  )
}
