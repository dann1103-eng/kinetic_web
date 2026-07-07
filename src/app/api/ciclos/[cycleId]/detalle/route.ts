import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type JSXElementConstructor, type ReactElement } from 'react'
import { fromZonedTime } from 'date-fns-tz'
import { createClient } from '@/lib/supabase/server'
import { CycleDetailPDF } from '@/components/families/pdf/CycleDetailPDF'
import { buildCycleDetail, type CycleDetailAppt } from '@/lib/domain/billing/cycle-detail'
import type {
  MonthlySessionCycle,
  TreatmentPlanScheduleSlot,
  TreatmentPlanTherapyEntry,
} from '@/types/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TZ = 'America/El_Salvador'

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

  // Ciclo
  const { data: cycleRaw } = await supabase
    .from('monthly_session_cycles')
    .select('*')
    .eq('id', cycleId)
    .maybeSingle()
  if (!cycleRaw) return NextResponse.json({ error: 'Ciclo no encontrado' }, { status: 404 })
  const cycle = cycleRaw as MonthlySessionCycle

  // Niño
  const { data: childRow } = await supabase
    .from('children')
    .select('full_name, preferred_name')
    .eq('id', cycle.child_id)
    .maybeSingle()
  const childName =
    (childRow as { full_name?: string; preferred_name?: string } | null)?.full_name ?? 'Niño/a'

  // Snapshot del plan (terapias + horario). Si el snapshot no trae horario,
  // se cae al plan activo del niño.
  const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
    therapies_json?: TreatmentPlanTherapyEntry[]
    schedule_pattern_json?: TreatmentPlanScheduleSlot[]
  }
  let schedule = snapshot.schedule_pattern_json ?? []
  if (schedule.length === 0) {
    const { data: planRow } = await supabase
      .from('treatment_plans')
      .select('schedule_pattern_json')
      .eq('child_id', cycle.child_id)
      .eq('active', true)
      .maybeSingle()
    schedule = ((planRow as { schedule_pattern_json?: TreatmentPlanScheduleSlot[] } | null)
      ?.schedule_pattern_json ?? []) as TreatmentPlanScheduleSlot[]
  }

  // Citas del mes del ciclo (terapias individuales + programa matutino).
  const ym = String(cycle.period_month).slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString()
  const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString()
  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('starts_at, service_type, status')
    .eq('child_id', cycle.child_id)
    .in('event_type', ['terapia', 'programa_matutino'])
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at')

  // Nota de pago desde la config de la empresa (si existe).
  const { data: settings } = await supabase
    .from('company_settings')
    .select('invoice_footer_note')
    .maybeSingle()
  const paymentNote =
    (settings as { invoice_footer_note?: string | null } | null)?.invoice_footer_note ?? null

  const data = buildCycleDetail({
    childName,
    periodMonth: `${ym}-01`,
    therapies: snapshot.therapies_json ?? [],
    schedule,
    appointments: (apptsRaw ?? []) as CycleDetailAppt[],
    paymentAmountUsd: Number(cycle.payment_amount_usd ?? 0),
    discountKind: cycle.discount_kind,
    discountValue: cycle.discount_value,
    surchargeUsd: cycle.surcharge_amount_usd,
  })

  const element = createElement(CycleDetailPDF, { data, paymentNote }) as unknown as ReactElement<
    DocumentProps,
    JSXElementConstructor<DocumentProps>
  >
  const buffer = await renderToBuffer(element)

  const slug = childName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const filename = `detalle-pago-${slug}-${ym}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
