import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { resolveBankTransferDoc, parseOtrosParam } from '@/lib/domain/reports/bank-transfer-data'
import { BankTransferPDF } from '@/components/reportes/contabilidad/pdf/BankTransferPDF'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
  const year = Number(url.searchParams.get('year'))
  const month = Number(url.searchParams.get('month'))
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
  }
  const otros = parseOtrosParam(url.searchParams.get('otros'))

  const { rows, totals } = await resolveBankTransferDoc(supabase, year, month, otros)

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(
    <BankTransferPDF
      rows={rows}
      totals={totals}
      monthLabel={`${MONTHS[month - 1]} ${year}`}
      logoUrl={logoUrl}
    />,
  )

  const filename = `kinetic-transferencias-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
