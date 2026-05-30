import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { AgendaPDF, type AgendaPdfRow } from '@/components/agenda/pdf/AgendaPDF'
import {
  EVENT_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type Appointment,
  type ServiceType,
  type EventType,
} from '@/types/db'
import { KINETIC_TEAL, KINETIC_RED } from '@/components/reportes/pdf/KineticReportPdf'

export const dynamic = 'force-dynamic'

const SV_TZ = 'America/El_Salvador'

const STATUS_COLORS: Record<string, string> = {
  completed: '#047857',
  no_show: KINETIC_RED,
  late_cancel: '#b45309',
  scheduled: KINETIC_TEAL,
  in_progress: '#0369a1',
  rescheduled: '#64748b',
  replacement: KINETIC_TEAL,
  cancelled: '#64748b',
}

function svDate(iso: string): { key: string; label: string; time: string } {
  const d = new Date(iso)
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: SV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d) // YYYY-MM-DD
  const label = new Intl.DateTimeFormat('es-SV', {
    timeZone: SV_TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d)
  const time = new Intl.DateTimeFormat('es-SV', {
    timeZone: SV_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return { key, label, time }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = appUser?.role as string | undefined
  if (!role || role === 'family' || role === 'client') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url = new URL(req.url)
  const idsParam = url.searchParams.get('ids')?.trim()
  const therapistFilterLabel = url.searchParams.get('therapist')?.trim() || null
  const childTitle = url.searchParams.get('child')?.trim() || null
  if (!idsParam) {
    return NextResponse.json({ error: 'Faltan citas a exportar' }, { status: 400 })
  }
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Faltan citas a exportar' }, { status: 400 })
  }

  const { data: apptData, error } = await supabase
    .from('appointments')
    .select('id, child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, custom_event_label')
    .in('id', ids)
    .order('starts_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const appts = (apptData ?? []) as Appointment[]

  // Lookups de niños y terapistas.
  const childIds = Array.from(new Set(appts.map((a) => a.child_id).filter(Boolean)))
  const therapistIds = Array.from(new Set(appts.map((a) => a.therapist_id).filter(Boolean))) as string[]

  const [{ data: childrenData }, { data: therapistData }, { data: logoSetting }] = await Promise.all([
    childIds.length
      ? supabase.from('children').select('id, full_name').in('id', childIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    therapistIds.length
      ? supabase.from('users').select('id, full_name').in('id', therapistIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.from('app_settings').select('value').eq('key', 'agency_logo_url').single(),
  ])

  const childName = new Map((childrenData ?? []).map((c) => [c.id, c.full_name]))
  const therapistName = new Map((therapistData ?? []).map((t) => [t.id, t.full_name]))
  const logoUrl = (logoSetting?.value as string | null) ?? null

  const rows: AgendaPdfRow[] = appts.map((a) => {
    const { key, label, time: startTime } = svDate(a.starts_at)
    const { time: endTime } = svDate(a.ends_at)
    const isTherapy = a.event_type === 'terapia'
    const serviceLabel = isTherapy && a.service_type
      ? SERVICE_TYPE_LABELS[a.service_type as ServiceType] ?? a.service_type
      : a.event_type === 'otro' && a.custom_event_label
        ? a.custom_event_label
        : EVENT_TYPE_LABELS[a.event_type as EventType] ?? a.event_type
    return {
      dateKey: key,
      dateLabel: label,
      time: `${startTime}–${endTime}`,
      childName: childName.get(a.child_id) ?? 'Niño/a',
      therapistName: a.therapist_id ? therapistName.get(a.therapist_id) ?? '—' : '—',
      serviceLabel,
      modalityLabel: a.modality === 'virtual' ? 'Virtual' : 'Presencial',
      statusLabel: APPOINTMENT_STATUS_LABELS[a.status] ?? a.status,
      statusColor: STATUS_COLORS[a.status] ?? '#1e293b',
    }
  })

  const rangeLabel = rows.length > 0
    ? rows[0].dateKey === rows[rows.length - 1].dateKey
      ? rows[0].dateLabel
      : `${rows[0].dateLabel} — ${rows[rows.length - 1].dateLabel}`
    : null

  const buffer = await renderToBuffer(
    <AgendaPDF
      rows={rows}
      therapistFilterLabel={therapistFilterLabel}
      rangeLabel={rangeLabel}
      titleOverride={childTitle ?? undefined}
      logoUrl={logoUrl}
    />,
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="kinetic-agenda.pdf"`,
    },
  })
}
