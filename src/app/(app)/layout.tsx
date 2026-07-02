import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { MobileSidebarProvider } from '@/components/layout/MobileSidebarProvider'
import { UserProvider } from '@/contexts/UserContext'
import { NotificationToastHost } from '@/components/notifications/NotificationToastHost'
import { FloatingChatDock } from '@/components/inbox/floating/FloatingChatDock'
import { CallDock } from '@/components/calls/CallDock'
import { IncomingCallToast } from '@/components/calls/IncomingCallToast'
import { ActiveCallProvider } from '@/contexts/ActiveCallContext'
import { LoginWelcomeDialog } from '@/components/layout/LoginWelcomeDialog'
import { IdleSchedulerWrapper } from '@/components/layout/IdleSchedulerWrapper'
import { SessionSentinel } from '@/components/auth/SessionSentinel'
import { SpectatorBanner } from '@/components/layout/SpectatorBanner'
import { DispatchWatcher } from '@/components/dispatch/DispatchWatcher'

interface AppLayoutProps {
  children: React.ReactNode
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  // Las cuentas de portal NO deben renderizar el shell de staff. Redirigimos por
  // ROL efectivo (respeta suplantación) en vez de depender de la lista de rutas del
  // middleware: `client` → portal FM, `family` → portal Kinetic. (H8 del audit)
  const portalRole = ctx.isImpersonating ? ctx.appUser.role : ctx.realAppUser.role
  if (portalRole === 'client') redirect('/portal/dashboard')
  if (portalRole === 'family') redirect('/portal')

  const supabase = await createClient()

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const agencyLogoUrl = logoSetting?.value ?? null

  return (
    <UserProvider
      user={ctx.appUser}
      isImpersonating={ctx.isImpersonating}
      realAdminName={ctx.isImpersonating ? ctx.realAppUser.full_name : null}
    >
      <ActiveCallProvider>
        <MobileSidebarProvider>
          <SpectatorBanner />
          <div className="flex h-screen overflow-hidden bg-fm-background">
            <Sidebar agencyLogoUrl={agencyLogoUrl} />
            <MobileSidebar agencyLogoUrl={agencyLogoUrl} />
            <div className="flex flex-col flex-1 md:ml-64 overflow-hidden">
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
          <NotificationToastHost />
          <FloatingChatDock />
          <CallDock />
          <IncomingCallToast />
          <LoginWelcomeDialog />
          <IdleSchedulerWrapper />
          <SessionSentinel />
          <DispatchWatcher currentUserRole={ctx.appUser.role} />
        </MobileSidebarProvider>
      </ActiveCallProvider>
    </UserProvider>
  )
}
