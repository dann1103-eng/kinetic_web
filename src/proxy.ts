import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const STAFF_PREFIXES = [
  '/dashboard',
  '/clients',
  '/pipeline',
  '/plans',
  '/calendario',
  '/inbox',
  '/tiempo',
  '/reports',
  '/renewals',
  '/billing',
  '/users',
  '/profile',
]

const PORTAL_PREFIX = '/portal'

// Debe coincidir con IMPERSONATE_COOKIE en src/lib/auth/effective-user.ts
const IMPERSONATE_COOKIE = 'fm_impersonate_user_id'

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  // Webhooks de proveedores externos (n1co, etc.) no usan auth de Supabase —
  // se autentican vía firma HMAC dentro del handler. Bypass total del middleware.
  if (request.nextUrl.pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next({ request })
  }

  // Callback público para flujo de pago embebido n1co — n1co redirige el iframe
  // a /n1co-callback y necesita cargarse sin auth (el iframe no tiene cookies).
  if (request.nextUrl.pathname.startsWith('/n1co-callback')) {
    return NextResponse.next({ request })
  }

  try {
    let supabaseResponse = NextResponse.next({ request })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Guard: if env vars are missing, fail safe to login redirect
    if (!supabaseUrl || !supabaseKey) {
      console.error('[proxy] Missing Supabase env vars')
      const { pathname } = request.nextUrl
      if (!pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      return supabaseResponse
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // Helper: preserva cookies refrescadas por Supabase al redirigir,
    // así no perdemos la oportunidad de extender la sesión durante un
    // redirect (e.g., cuando el JWT viejo es válido pero estaba por
    // expirar y Supabase generó cookies nuevas durante getUser()).
    function redirectKeepingCookies(targetUrl: URL): NextResponse {
      const res = NextResponse.redirect(targetUrl)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        res.cookies.set(cookie)
      })
      return res
    }

    // Public routes — /login and /auth/* (signout route handler)
    if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
      // Redirect already-authenticated users away from login (role-aware)
      if (user && pathname.startsWith('/login')) {
        const { data: appUser } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        let dest = '/dashboard'
        if (appUser?.role === 'family') dest = '/portal'
        else if (appUser?.role === 'client') dest = '/portal/dashboard'
        return redirectKeepingCookies(new URL(dest, request.url))
      }
      return supabaseResponse
    }

    // All other routes require auth
    if (!user) {
      return redirectKeepingCookies(new URL('/login', request.url))
    }

    // Fetch role for authenticated, non-public requests
    let role: string | null = null
    const { data: appUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = appUser?.role ?? null

    // Detectar suplantación: si el real es admin y la cookie apunta a otro
    // user, resolver el rol "efectivo" del usuario suplantado para que las
    // reglas de routing usen ese rol y no el del admin real.
    const impersonateId = request.cookies.get(IMPERSONATE_COOKIE)?.value
    let effectiveRole: string | null = role
    if (impersonateId && impersonateId !== user.id && role === 'admin') {
      const { data: targetUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', impersonateId)
        .maybeSingle()
      // Solo suplantar si el target NO es otro admin
      if (targetUser?.role && targetUser.role !== 'admin') {
        effectiveRole = targetUser.role
      }
    }

    // Rule 2a: clientes FM en rutas staff → portal FM
    if (effectiveRole === 'client' && startsWithAny(pathname, STAFF_PREFIXES)) {
      return redirectKeepingCookies(new URL('/portal/dashboard', request.url))
    }

    // Rule 2b: familias Kinetic en rutas staff → portal Kinetic family (home)
    if (effectiveRole === 'family' && startsWithAny(pathname, STAFF_PREFIXES)) {
      return redirectKeepingCookies(new URL('/portal', request.url))
    }

    // Rule 3: staff (real, no suplantando cliente/familia) en /portal/* → /dashboard
    if (
      effectiveRole &&
      effectiveRole !== 'client' &&
      effectiveRole !== 'family' &&
      pathname.startsWith(PORTAL_PREFIX)
    ) {
      return redirectKeepingCookies(new URL('/dashboard', request.url))
    }

    supabaseResponse.headers.set('x-pathname', pathname)
    return supabaseResponse
  } catch (error) {
    console.error('[proxy] Unhandled error:', error)
    // Fail safe: never crash — redirect to login for protected routes
    const { pathname } = request.nextUrl
    if (!pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.json|icons/|mockup-calendario.html|ringtone\\.mp3).*)',
  ],
}
