import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type JSXElementConstructor, type ReactElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { CycleDetailPDF } from '@/components/families/pdf/CycleDetailPDF'
import { buildCycleDetail } from '@/lib/domain/billing/cycle-detail'
import { loadCycleDetailInput } from '@/lib/domain/billing/cycle-detail-input'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params
  const supabase = await createClient()

  // Auth: solo staff (no portal family/client).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || ['client', 'family'].includes((me as { role: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Ciclo, niño, snapshot y citas del mes: los carga el mismo cargador que usa la
  // previsualización, para que el documento y la pantalla no puedan divergir.
  const input = await loadCycleDetailInput(supabase, cycleId)
  if (!input) return NextResponse.json({ error: 'Ciclo no encontrado' }, { status: 404 })
  const { cycle, childName } = input

  // Nota de pago desde la config de la empresa (si existe).
  const { data: settings } = await supabase
    .from('company_settings')
    .select('invoice_footer_note')
    .maybeSingle()
  const paymentNote =
    (settings as { invoice_footer_note?: string | null } | null)?.invoice_footer_note ?? null

  const data = buildCycleDetail({
    childName,
    periodMonth: input.periodMonth,
    therapies: input.therapies,
    schedule: input.schedule,
    appointments: input.appointments,
    paymentAmountUsd: Number(cycle.payment_amount_usd ?? 0),
    discountKind: cycle.discount_kind,
    discountValue: cycle.discount_value,
    surchargeUsd: cycle.surcharge_amount_usd,
    paymentStatus: cycle.payment_status,
    billingAdjustmentUsd: cycle.billing_adjustment_usd,
  })

  const element = createElement(CycleDetailPDF, { data, paymentNote }) as unknown as ReactElement<
    DocumentProps,
    JSXElementConstructor<DocumentProps>
  >
  const buffer = await renderToBuffer(element)

  const slug = childName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const filename = `detalle-pago-${slug}-${input.periodMonth.slice(0, 7)}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
