import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getActiveClientId, getActiveClientIds } from '@/lib/supabase/active-client'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { PortalSidebar } from '@/components/portal/PortalSidebar'
import { PortalTopNav } from '@/components/portal/PortalTopNav'
import { UserProvider } from '@/contexts/UserContext'
import { SessionSentinel } from '@/components/auth/SessionSentinel'
import { SpectatorBanner } from '@/components/layout/SpectatorBanner'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  // Solo clientes (reales o suplantados) acceden al portal.
  if (ctx.appUser.role !== 'client') redirect('/dashboard')

  const ids = await getActiveClientIds()
  if (ids.length === 0) {
    // Route Handler puede limpiar cookies; signOut() en Server Component es silenciado.
    if (ctx.isImpersonating) redirect('/users')
    redirect('/auth/signout')
  }

  const hdrs = await headers()
  const currentPath = hdrs.get('x-pathname') ?? ''
  const isSelectingBrand = currentPath === '/portal/seleccionar-marca'

  let activeId = await getActiveClientId()

  // Si el admin está suplantando un cliente y no hay activeId resuelto
  // (ej. el admin nunca tuvo cookie portal_active_client, o apunta a una
  // marca que no le pertenece al impersonado), auto-elegir la primera
  // marca del impersonado para evitar mostrarle el selector al admin.
  if (!activeId && ctx.isImpersonating && ids.length > 0) {
    activeId = ids[0]
  }

  if (!activeId && !isSelectingBrand) redirect('/portal/seleccionar-marca')

  if (isSelectingBrand && !activeId) {
    return (
      <UserProvider
        user={ctx.appUser}
        isImpersonating={ctx.isImpersonating}
        realAdminName={ctx.isImpersonating ? ctx.realAppUser.full_name : null}
      >
        <SpectatorBanner />
        <div className="flex h-screen overflow-hidden bg-fm-background">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <SessionSentinel />
      </UserProvider>
    )
  }

  const supabase = await createClient()
  const { data: clientOptions } = await supabase
    .from('clients')
    .select('id, name, logo_url')
    .in('id', ids)

  const active = clientOptions?.find((c) => c.id === activeId)
  const clientDisplayName = active?.name ?? 'Mi empresa'

  return (
    <UserProvider
      user={ctx.appUser}
      isImpersonating={ctx.isImpersonating}
      realAdminName={ctx.isImpersonating ? ctx.realAppUser.full_name : null}
    >
      <SpectatorBanner />
      <div className="flex h-screen overflow-hidden bg-fm-background">
        <PortalSidebar
          clientOptions={clientOptions ?? []}
          activeClientId={activeId!}
          clientDisplayName={clientDisplayName}
        />
        <div className="flex flex-col flex-1 md:ml-64 overflow-hidden">
          <PortalTopNav clientDisplayName={clientDisplayName} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <SessionSentinel />
    </UserProvider>
  )
}
