import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserRole } from '@/types/db'

export const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

export interface AuthContext {
  supabase: SupabaseClient<Database>
  logoUrl: string | null
}

/**
 * Valida auth + rol para endpoints de reportería financiera.
 * Retorna `{ context }` si pasa, o `{ response }` con el NextResponse listo
 * para devolver al cliente si rebota.
 */
export async function ensureFinancialReportAccess(): Promise<
  | { context: AuthContext }
  | { response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = appUser?.role as UserRole | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return { response: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }
  }

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  return { context: { supabase, logoUrl } }
}

export function parseYearParam(searchParams: URLSearchParams, fallback: number): number {
  const raw = searchParams.get('year')
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 2000 || n > 2100) return fallback
  return n
}

export function parseDateParam(value: string | null): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export function pdfResponse(buffer: Uint8Array | Buffer, filename: string): NextResponse {
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
