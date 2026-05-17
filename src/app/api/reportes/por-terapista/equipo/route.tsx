import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getTherapistMonthlyReport } from '@/lib/domain/reports/therapist'
import { TeamReportPDF } from '@/components/reportes/por-terapista/pdf/TeamReportPDF'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'coordinadora_terapias']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = appUser?.role as UserRole | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url = new URL(req.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get('year') ?? `${now.getFullYear()}`, 10) || now.getFullYear()
  const month = parseInt(url.searchParams.get('month') ?? `${now.getMonth() + 1}`, 10) || now.getMonth() + 1

  const report = await getTherapistMonthlyReport(supabase, { year, month })

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(<TeamReportPDF report={report} logoUrl={logoUrl} />)
  const filename = `kinetic-equipo-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
