import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { ChildDischargePDF } from '@/components/discharge/ChildDischargePDF'
import type { ChildDischargeRecord } from '@/types/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: row } = await supabase
    .from('child_discharge_records')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!row) {
    return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
  }
  // RLS ya gateó SELECT a staff o family con status='sent_to_family'.
  const record = row as ChildDischargeRecord

  const { data: logoSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency_logo_url')
    .single()
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const buffer = await renderToBuffer(
    <ChildDischargePDF record={record} logoUrl={logoUrl} />,
  )

  // Marcar pdf_generated_at (best-effort, no bloqueante)
  if (!record.pdf_generated_at) {
    await supabase
      .from('child_discharge_records')
      .update({ pdf_generated_at: new Date().toISOString() })
      .eq('id', id)
  }

  const childName = record.child_snapshot_json.full_name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  const filename = `kinetic-${record.discharge_type}-${childName}-${record.discharge_date}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
