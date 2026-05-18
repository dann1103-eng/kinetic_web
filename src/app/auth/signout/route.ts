import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

async function handleSignout(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Limpiar current_session_id del usuario antes del signOut, para que ningún
  // dispositivo huérfano siga apareciendo como "vigente". Si falla por RLS o
  // por cualquier otro motivo, ignoramos para no bloquear el logout.
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('users')
        .update({ current_session_id: null })
        .eq('id', user.id)
    }
  } catch {
    /* ignore */
  }

  await supabase.auth.signOut()
  return response
}

export async function GET(request: NextRequest) {
  // Defensa contra Next.js prefetch: si la request es un prefetch automático,
  // NO ejecutar el signout. Esto pasa si algún <Link href="/auth/signout"> se
  // renderiza — Next prefetchea el href en el background, desloguendo al
  // usuario sin que hizo click. La forma correcta de invocar signout es por
  // POST (formulario); el GET solo queda como compat de URLs directas.
  const prefetchHeader =
    request.headers.get('next-router-prefetch') ??
    request.headers.get('x-purpose') ??
    request.headers.get('purpose')
  if (prefetchHeader) {
    return new NextResponse(null, { status: 204 })
  }
  return handleSignout(request)
}

export async function POST(request: NextRequest) {
  return handleSignout(request)
}
