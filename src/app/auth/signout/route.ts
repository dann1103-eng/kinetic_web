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
  return handleSignout(request)
}

export async function POST(request: NextRequest) {
  return handleSignout(request)
}
