import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { PayrollRunPDF } from '@/components/reportes/contabilidad/pdf/PayrollRunPDF'
import type { PayrollItem, PayrollRun, UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable']

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
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })
  if ((run as PayrollRun).status === 'draft') {
    return NextResponse.json({ error: 'No se puede descargar PDF de planilla en borrador' }, { status: 400 })
  }

  const { data: itemsRaw } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_run_id', id)
    .order('created_at')

  const userIds = ((itemsRaw ?? []) as PayrollItem[]).map((i) => i.user_id)
  let usersById = new Map<string, { id: string; full_name: string; email: string; role: string }>()
  if (userIds.length > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('id', userIds)
    usersById = new Map(
      ((usersRaw ?? []) as Array<{ id: string; full_name: string; email: string; role: string }>).map((u) => [u.id, u]),
    )
  }
  const items = ((itemsRaw ?? []) as PayrollItem[]).map((it) => ({
    ...it,
    user: usersById.get(it.user_id) ?? null,
  }))

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(
    <PayrollRunPDF run={run as PayrollRun} items={items} logoUrl={logoUrl} />,
  )

  const r = run as PayrollRun
  const filename = `kinetic-planilla-${r.period_year}-${String(r.period_month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
