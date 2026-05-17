import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getTherapistDetailedReport } from '@/lib/domain/reports/therapist'
import { IndividualTherapistPDF } from '@/components/reportes/por-terapista/pdf/IndividualTherapistPDF'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'coordinadora_terapias']

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = appUser?.role as UserRole | undefined

  // Admin/directora/coord_terapias pueden ver cualquier terapista.
  // El terapista mismo puede ver SU propio PDF (auto-reporte).
  const isManager = role && ALLOWED_ROLES.includes(role)
  const isSelf = user.id === id
  if (!isManager && !isSelf) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url = new URL(req.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get('year') ?? `${now.getFullYear()}`, 10) || now.getFullYear()
  const month = parseInt(url.searchParams.get('month') ?? `${now.getMonth() + 1}`, 10) || now.getMonth() + 1

  const detail = await getTherapistDetailedReport(supabase, { year, month, therapistId: id })
  if (!detail) return NextResponse.json({ error: 'Terapista no encontrado' }, { status: 404 })

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(<IndividualTherapistPDF detail={detail} logoUrl={logoUrl} />)
  const safeName = detail.therapist.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const filename = `kinetic-terapista-${safeName}-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
