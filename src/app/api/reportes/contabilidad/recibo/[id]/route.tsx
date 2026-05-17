import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { PayrollItemPDF } from '@/components/reportes/contabilidad/pdf/PayrollItemPDF'
import type { PayrollItem, PayrollRun, UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES: UserRole[] = ['admin', 'directora', 'contable']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = appUser?.role as UserRole | undefined
  if (!role) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: itemRaw } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!itemRaw) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 })

  const { data: userRaw } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', (itemRaw as PayrollItem).user_id)
    .maybeSingle()

  const item = {
    ...(itemRaw as PayrollItem),
    user: (userRaw as { id: string; full_name: string; email: string; role: string } | null) ?? null,
  }

  // Auth: admin/directora/contable pueden ver cualquier recibo; empleado solo el suyo.
  const isAdmin = ADMIN_ROLES.includes(role)
  if (!isAdmin && item.user_id !== user.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', item.payroll_run_id)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })
  if ((run as PayrollRun).status === 'draft') {
    return NextResponse.json({ error: 'No disponible: planilla aún en borrador' }, { status: 400 })
  }

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(
    <PayrollItemPDF run={run as PayrollRun} item={item} logoUrl={logoUrl} />,
  )

  const r = run as PayrollRun
  const filename = `kinetic-recibo-${r.period_year}-${String(r.period_month).padStart(2, '0')}-${item.user?.full_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'empleado'}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
