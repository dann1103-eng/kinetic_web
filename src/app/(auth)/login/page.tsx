import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .maybeSingle()

  const agencyLogoUrl = (data?.value as string | null) ?? null

  // Detectar si ya hay una sesión activa en este navegador (computadora
  // compartida). Si la hay, el form lo avisa para que la persona cierre la
  // sesión ajena antes de entrar con la suya — evita el "me redirige al correo
  // de otra persona".
  let existingSession: { name: string; email: string } | null = null
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    const { data: appUser } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', authUser.id)
      .maybeSingle()
    existingSession = {
      name: appUser?.full_name ?? '',
      email: appUser?.email ?? authUser.email ?? '',
    }
  }

  return <LoginForm agencyLogoUrl={agencyLogoUrl} existingSession={existingSession} />
}
