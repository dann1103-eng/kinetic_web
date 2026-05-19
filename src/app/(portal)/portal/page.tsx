import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  PortalNextAppointmentCard,
  type PortalAppointmentData,
} from '@/components/portal/PortalNextAppointmentCard'
import {
  PortalCalendarWidget,
  type CalendarAppt,
} from '@/components/portal/PortalCalendarWidget'
import type { Child } from '@/types/db'

export const dynamic = 'force-dynamic'

// ─── helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string | null | undefined): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
  })
}

function periodLabel(isoDate: string | null): string {
  if (!isoDate) return ''
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return shortDate(iso)
}

// ─── local types ─────────────────────────────────────────────────────────────

type NextAppt = {
  id: string
  starts_at: string
  ends_at: string | null
  child_id: string
  therapist_id: string | null
  service_type: string | null
}

type ProgressReportRow = {
  id: string
  child_id: string
  sent_to_family_at: string | null
}

type SessionReportRow = {
  id: string
  child_id: string
  sent_to_family_at: string | null
  actividades: string | null
  session_id: string | null
}

type JournalRow = {
  id: string
  child_id: string
  category: string
  body: string
  created_at: string
}

type PendingAbsenceRow = {
  id: string
  child_id: string
  reported_at: string
  appointment_id: string
  appt_starts_at?: string
  appt_service_type?: string | null
}

type CalRawRow = {
  id: string
  starts_at: string
  ends_at: string | null
  child_id: string
  service_type: string | null
  event_type: string | null
  therapist_id: string | null
}

type InvRow = {
  id: string
  status: string
  total_a_pagar: number | null
  payment_date: string | null
  issue_date: string | null
  payment_method: string | null
  invoice_number: string | null
}

// ─── category metadata ────────────────────────────────────────────────────────

const JOURNAL_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  home_exercise: { label: 'Ejercicio en casa', icon: 'fitness_center',  color: 'text-kp-tertiary',  bg: 'bg-kp-tertiary-container/15' },
  observation:   { label: 'Observación',       icon: 'visibility',      color: 'text-kp-primary',   bg: 'bg-kp-primary-container/15' },
  question:      { label: 'Pregunta',           icon: 'help_outline',    color: 'text-kp-secondary', bg: 'bg-kp-secondary-container/15' },
  response:      { label: 'Respuesta',          icon: 'forum',           color: 'text-kp-primary',   bg: 'bg-kp-primary-container/15' },
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function PortalHomePage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Permisos
  const { data: familyUserRow } = await supabase
    .from('family_users')
    .select('can_billing, can_work')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()

  const canWork    = familyUserRow?.can_work    ?? true
  const canBilling = familyUserRow?.can_billing ?? false

  const firstName = ctx.appUser.full_name.split(' ')[0]

  // Niños
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')
  const children = (childrenRaw ?? []) as Pick<Child, 'id' | 'full_name' | 'preferred_name'>[]
  const childIds = children.map((c) => c.id)
  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.preferred_name ?? c.full_name]),
  )

  // ── Próxima cita ──────────────────────────────────────────────────────────
  let nextAppointment: PortalAppointmentData | null = null

  if (canWork && childIds.length > 0) {
    const nowIso = new Date().toISOString()
    const { data: apptRaw } = await supabase
      .from('appointments')
      .select('id, child_id, starts_at, ends_at, therapist_id, service_type')
      .in('child_id', childIds)
      .in('status', ['scheduled', 'in_progress', 'replacement'])
      .gte('starts_at', nowIso)
      .order('starts_at')
      .limit(1)
      .maybeSingle()

    if (apptRaw) {
      const appt = apptRaw as NextAppt
      let therapistName: string | null = null
      let therapistAvatarUrl: string | null = null
      if (appt.therapist_id) {
        const { data: th } = await supabase
          .from('users')
          .select('full_name, avatar_url')
          .eq('id', appt.therapist_id)
          .maybeSingle()
        const row = th as { full_name: string; avatar_url: string | null } | null
        therapistName = row?.full_name ?? null
        therapistAvatarUrl = row?.avatar_url ?? null
      }
      nextAppointment = {
        id: appt.id,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        child_name: childNamesById[appt.child_id] ?? '',
        therapist_name: therapistName,
        therapist_avatar_url: therapistAvatarUrl,
        service_type: appt.service_type,
      }
    }
  }

  // ── Informes de avance ────────────────────────────────────────────────────
  let progressReports: ProgressReportRow[] = []

  if (canWork && childIds.length > 0) {
    const { data: prRaw } = await supabase
      .from('progress_reports')
      .select('id, child_id, sent_to_family_at')
      .in('child_id', childIds)
      .eq('status', 'sent_to_family')
      .eq('visible_to_family', true)
      .order('sent_to_family_at', { ascending: false })
      .limit(4)
    progressReports = (prRaw ?? []) as ProgressReportRow[]
  }

  // ── Sesiones recientes ────────────────────────────────────────────────────
  let sessionReports: SessionReportRow[] = []
  const sessionApptMap: Record<string, { service_type: string | null; therapist_id: string | null }> = {}
  const sessionTherapistMap: Record<string, string> = {}

  if (canWork && childIds.length > 0) {
    const { data: srRaw } = await supabase
      .from('session_reports')
      .select('id, child_id, sent_to_family_at, actividades, session_id')
      .in('child_id', childIds)
      .eq('status', 'sent_to_family')
      .eq('visible_to_family', true)
      .order('sent_to_family_at', { ascending: false })
      .limit(4)
    sessionReports = (srRaw ?? []) as SessionReportRow[]

    const sessionIds = sessionReports.map((r) => r.session_id).filter(Boolean) as string[]
    if (sessionIds.length > 0) {
      const { data: apptRows } = await supabase
        .from('appointments')
        .select('id, service_type, therapist_id')
        .in('id', sessionIds)
      for (const a of apptRows ?? []) {
        sessionApptMap[a.id] = { service_type: a.service_type, therapist_id: a.therapist_id }
      }
      const therapistIds = Array.from(
        new Set(Object.values(sessionApptMap).map((a) => a.therapist_id).filter(Boolean) as string[]),
      )
      if (therapistIds.length > 0) {
        const { data: therapists } = await supabase
          .from('users').select('id, full_name').in('id', therapistIds)
        for (const t of therapists ?? []) sessionTherapistMap[t.id] = t.full_name
      }
    }
  }

  // ── Agenda digital — entradas del diario visibles a la familia ────────────
  let journalEntries: JournalRow[] = []

  if (canWork && childIds.length > 0) {
    const { data: jeRaw } = await supabase
      .from('child_journal_entries')
      .select('id, child_id, category, body, created_at')
      .in('child_id', childIds)
      .eq('visible_to_family', true)
      .order('created_at', { ascending: false })
      .limit(3)
    journalEntries = (jeRaw ?? []) as JournalRow[]
  }

  // ── Citas por reponer (inasistencias pendientes) ─────────────────────────
  let pendingAbsences: PendingAbsenceRow[] = []

  if (canWork && childIds.length > 0) {
    const { data: absRaw } = await supabase
      .from('appointment_absences')
      .select('id, child_id, reported_at, appointment_id')
      .in('child_id', childIds)
      .eq('status', 'pending')
      .order('reported_at', { ascending: true })

    if (absRaw && absRaw.length > 0) {
      const apptIds = absRaw.map((a) => a.appointment_id).filter(Boolean) as string[]
      const { data: origAppts } = apptIds.length
        ? await supabase
            .from('appointments')
            .select('id, starts_at, service_type')
            .in('id', apptIds)
        : { data: [] }
      const apptMap = Object.fromEntries(
        (origAppts ?? []).map((a) => [a.id, { starts_at: a.starts_at, service_type: a.service_type }]),
      )
      pendingAbsences = absRaw.map((a) => ({
        id: a.id,
        child_id: a.child_id,
        reported_at: a.reported_at,
        appointment_id: a.appointment_id,
        appt_starts_at: apptMap[a.appointment_id]?.starts_at,
        appt_service_type: apptMap[a.appointment_id]?.service_type ?? null,
      }))
    }
  }

  // ── Facturación ───────────────────────────────────────────────────────────
  let allInvoices: InvRow[] = []
  let pendingInvoices = 0
  let pendingTotal    = 0
  let latestPaidInvoice: InvRow | null = null
  let recentPaidInvoices: InvRow[] = []

  if (canBilling && childIds.length > 0) {
    const { data: invRaw } = await supabase
      .from('invoices')
      .select('id, status, total_a_pagar, payment_date, issue_date, payment_method, invoice_number')
      .in('child_id', childIds)
      .order('issue_date', { ascending: false })
      .limit(10)

    allInvoices = (invRaw ?? []) as InvRow[]
    for (const inv of allInvoices) {
      if (inv.status === 'issued') {
        pendingInvoices++
        pendingTotal += Number(inv.total_a_pagar ?? 0)
      }
    }
    latestPaidInvoice  = allInvoices.find((i) => i.status === 'paid') ?? null
    recentPaidInvoices = allInvoices.filter((i) => i.status === 'paid').slice(0, 2)
  }

  // ── Citas del mes — para el widget de calendario en el inicio ─────────────
  let calendarAppts: CalendarAppt[] = []

  if (canWork && childIds.length > 0) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: calRaw } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at, child_id, service_type, event_type, therapist_id')
      .in('child_id', childIds)
      .gte('starts_at', monthStart.toISOString())
      .in('status', ['scheduled', 'in_progress', 'replacement'])
      .order('starts_at')

    const calRows = (calRaw ?? []) as CalRawRow[]

    // Fetch therapist names for calendar detail panel
    const calTherapistIds = Array.from(
      new Set(calRows.map((a) => a.therapist_id).filter(Boolean) as string[]),
    )
    const { data: calTherapists } = calTherapistIds.length
      ? await supabase.from('users').select('id, full_name').in('id', calTherapistIds)
      : { data: [] }
    const calTherapistNames: Record<string, string> = Object.fromEntries(
      (calTherapists ?? []).map((t) => [t.id, t.full_name]),
    )

    calendarAppts = calRows.map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      child_id: a.child_id,
      service_type: a.service_type,
      event_type: a.event_type,
      therapist_name: a.therapist_id ? (calTherapistNames[a.therapist_id] ?? null) : null,
    }))
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Desktop greeting ── */}
      <div className="hidden md:flex items-start justify-between mb-2">
        <div>
          <h1 className="text-[32px] font-black text-fm-on-surface leading-tight">
            ¡Hola, {firstName}!
          </h1>
          <p className="text-[15px] text-fm-on-surface-variant mt-1">
            Bienvenido al portal de padres
          </p>
        </div>
        <p className="text-[13px] text-fm-on-surface-variant mt-2 capitalize">
          {new Date().toLocaleDateString('es-SV', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
      </div>

      {/* ── Main grid: left 8 cols + right 4 cols on desktop; stacked on mobile ── */}
      <div className="md:grid md:grid-cols-12 md:gap-8 md:items-start">

        {/* ─── Left / main column ─── */}
        <div className={`${canBilling ? 'md:col-span-8' : 'md:col-span-12'} flex flex-col gap-6`}>

          {/* Próxima Cita */}
          {canWork && (
            <section>
              <PortalNextAppointmentCard appointment={nextAppointment} />
            </section>
          )}

          {/* ── Citas por reponer ── */}
          {canWork && pendingAbsences.length > 0 && (
            <section>
              <div className="rounded-[24px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">event_busy</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-amber-900 dark:text-amber-200">
                      {pendingAbsences.length === 1
                        ? '1 cita pendiente de reposición'
                        : `${pendingAbsences.length} citas pendientes de reposición`}
                    </p>
                    <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-0.5">
                      El equipo de Kinetic está coordinando las siguientes reposiciones
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {pendingAbsences.map((abs) => {
                        const childName = childNamesById[abs.child_id] ?? '—'
                        const dateLabel = abs.appt_starts_at
                          ? new Date(abs.appt_starts_at).toLocaleDateString('es-SV', {
                              weekday: 'short', day: 'numeric', month: 'short',
                            })
                          : '—'
                        return (
                          <div key={abs.id} className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500">circle</span>
                            <span className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
                              {childName}
                            </span>
                            <span className="text-[12px] text-amber-600 dark:text-amber-400 capitalize">
                              — {dateLabel}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Reportes de avance ── */}
          {canWork && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[20px] font-bold text-fm-on-surface">Reportes</h3>
                <Link href="/portal/agenda-digital" className="text-[14px] font-semibold text-kp-primary">
                  Ver todos
                </Link>
              </div>

              {progressReports.length === 0 ? (
                /* Empty state */
                <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[28px] p-6 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-fm-outline-variant">description</span>
                  <p className="text-[14px] font-semibold text-fm-on-surface-variant">
                    Sin informes disponibles aún
                  </p>
                  <p className="text-[12px] text-fm-on-surface-variant text-center max-w-xs">
                    Tus informes cuatrimestrales aparecerán aquí cuando el equipo los publique.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile: horizontal carousel */}
                  <div className="md:hidden flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-hide -mx-4 px-4">
                    {progressReports.map((report, i) => {
                      const isEven = i % 2 === 0
                      return (
                        <div
                          key={report.id}
                          className="min-w-[240px] bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] p-5 snap-start flex-shrink-0"
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${isEven ? 'bg-kp-tertiary-container/10' : 'bg-kp-primary-container/10'}`}>
                            <span className={`material-symbols-outlined ${isEven ? 'text-kp-tertiary' : 'text-kp-primary'}`}>
                              {isEven ? 'description' : 'assessment'}
                            </span>
                          </div>
                          <h4 className="text-[16px] font-bold text-fm-on-surface mb-1">
                            Informe cuatrimestral
                          </h4>
                          <p className="text-[12px] font-semibold text-fm-on-surface-variant mb-4">
                            {report.sent_to_family_at
                              ? `Publicado: ${shortDate(report.sent_to_family_at)}`
                              : childNamesById[report.child_id] ?? ''}
                          </p>
                          <Link
                            href="/portal/agenda-digital"
                            className="block w-full py-2 bg-fm-surface-container-low text-fm-on-surface-variant rounded-full text-[12px] font-semibold text-center"
                          >
                            Ver PDF
                          </Link>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop: bento 2-col grid */}
                  <div className="hidden md:grid grid-cols-2 gap-4">
                    {progressReports.slice(0, 2).map((report, i) => {
                      const isGreen = i === 0
                      return (
                        <div
                          key={report.id}
                          className={`rounded-[28px] p-6 flex flex-col ${
                            isGreen
                              ? 'bg-kp-tertiary-container text-kp-on-tertiary'
                              : 'bg-fm-surface-container-lowest border border-fm-outline-variant'
                          }`}
                          style={{ minHeight: '240px' }}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${isGreen ? 'bg-white/20' : 'bg-kp-primary-container/10'}`}>
                            <span className={`material-symbols-outlined ${isGreen ? 'text-white' : 'text-kp-primary'}`}>
                              {isGreen ? 'analytics' : 'psychology'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <h4 className={`text-[16px] font-bold mb-1 ${isGreen ? 'text-white' : 'text-fm-on-surface'}`}>
                              Informe cuatrimestral
                            </h4>
                            <p className={`text-[13px] mb-1 ${isGreen ? 'text-white/80' : 'text-fm-on-surface-variant'}`}>
                              {childNamesById[report.child_id] ?? '—'}
                            </p>
                            {report.sent_to_family_at && (
                              <p className={`text-[12px] ${isGreen ? 'text-white/70' : 'text-fm-on-surface-variant'}`}>
                                Publicado: {shortDate(report.sent_to_family_at)}
                              </p>
                            )}
                          </div>
                          <Link
                            href="/portal/agenda-digital"
                            className={`mt-4 flex items-center gap-1.5 text-[13px] font-semibold ${isGreen ? 'text-white' : 'text-kp-primary'}`}
                          >
                            Descargar PDF
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Sesiones Recientes ── */}
          {canWork && (
            <section className="flex flex-col gap-3">
              <h3 className="text-[20px] font-bold text-fm-on-surface px-1">Sesiones Recientes</h3>

              {sessionReports.length === 0 ? (
                /* Empty state */
                <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[28px] p-6 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-fm-outline-variant">history_edu</span>
                  <p className="text-[14px] font-semibold text-fm-on-surface-variant">
                    Sin reportes de sesión aún
                  </p>
                  <p className="text-[12px] text-fm-on-surface-variant text-center max-w-xs">
                    Los reportes de cada sesión aparecerán aquí una vez que el terapeuta los envíe.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile: flat cards */}
                  <div className="md:hidden flex flex-col gap-3">
                    {sessionReports.slice(0, 3).map((report) => {
                      const apptData      = report.session_id ? sessionApptMap[report.session_id] : null
                      const therapistId   = apptData?.therapist_id ?? null
                      const therapistName = therapistId ? (sessionTherapistMap[therapistId] ?? null) : null
                      const serviceLabel  = capitalize(apptData?.service_type) || 'Reporte de sesión'
                      const dateLabel     = shortDate(report.sent_to_family_at)
                      return (
                        <div
                          key={report.id}
                          className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[24px] p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-fm-surface-container-high rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-fm-on-surface-variant text-[20px]">history</span>
                            </div>
                            <div>
                              <p className="text-[16px] font-semibold text-fm-on-surface">{serviceLabel}</p>
                              <p className="text-[12px] font-semibold text-fm-on-surface-variant">
                                {dateLabel}{therapistName && ` • ${therapistName}`}
                              </p>
                            </div>
                          </div>
                          <Link
                            href="/portal/agenda-digital"
                            className="text-kp-primary text-[12px] font-semibold px-4 py-2 hover:bg-kp-primary/5 rounded-full transition-colors flex-shrink-0"
                          >
                            Leer reporte
                          </Link>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop: table-style card */}
                  <div className="hidden md:block bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-[24px] overflow-hidden">
                    {sessionReports.slice(0, 4).map((report, idx) => {
                      const apptData      = report.session_id ? sessionApptMap[report.session_id] : null
                      const therapistId   = apptData?.therapist_id ?? null
                      const therapistName = therapistId ? (sessionTherapistMap[therapistId] ?? null) : null
                      const serviceLabel  = capitalize(apptData?.service_type) || 'Reporte de sesión'
                      const dateLabel     = shortDate(report.sent_to_family_at)
                      return (
                        <div
                          key={report.id}
                          className={`flex items-center justify-between px-6 py-4 ${idx > 0 ? 'border-t border-fm-outline-variant/15' : ''}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-fm-surface-container-high rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-fm-on-surface-variant text-[18px]">history_edu</span>
                            </div>
                            <div>
                              <p className="text-[15px] font-semibold text-fm-on-surface">{serviceLabel}</p>
                              <p className="text-[12px] text-fm-on-surface-variant">
                                {dateLabel}{therapistName && ` · ${therapistName}`}
                              </p>
                            </div>
                          </div>
                          <Link
                            href="/portal/agenda-digital"
                            className="text-kp-primary text-[12px] font-semibold tracking-[0.05em] uppercase bg-kp-primary-container/15 px-4 py-1.5 rounded-full hover:bg-kp-primary-container/25 transition-colors flex-shrink-0"
                          >
                            Leer reporte
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Agenda Digital — notas del terapeuta ── */}
          {canWork && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[20px] font-bold text-fm-on-surface">Agenda Digital</h3>
                <Link href="/portal/agenda-digital" className="text-[14px] font-semibold text-kp-primary">
                  Ver todo
                </Link>
              </div>

              {journalEntries.length === 0 ? (
                /* Empty state */
                <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[28px] p-6 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-fm-outline-variant">menu_book</span>
                  <p className="text-[14px] font-semibold text-fm-on-surface-variant">
                    Sin notas publicadas aún
                  </p>
                  <p className="text-[12px] text-fm-on-surface-variant text-center max-w-xs">
                    Las notas y ejercicios del terapeuta aparecerán aquí.
                  </p>
                </div>
              ) : (
                <div className="bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-[28px] overflow-hidden">
                  {journalEntries.map((entry, idx) => {
                    const meta = JOURNAL_META[entry.category] ?? JOURNAL_META.observation
                    const preview = entry.body.length > 90
                      ? entry.body.slice(0, 90).trimEnd() + '…'
                      : entry.body
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-4 px-5 py-4 ${idx > 0 ? 'border-t border-fm-outline-variant/15' : ''}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                          <span className={`material-symbols-outlined text-[18px] ${meta.color}`}>
                            {meta.icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-fm-on-surface-variant">
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-fm-outline-variant">·</span>
                            <span className="text-[11px] text-fm-on-surface-variant">
                              {childNamesById[entry.child_id] ?? '—'}
                            </span>
                            <span className="text-[11px] text-fm-outline-variant">·</span>
                            <span className="text-[11px] text-fm-on-surface-variant">
                              {timeAgo(entry.created_at)}
                            </span>
                          </div>
                          <p className="text-[14px] text-fm-on-surface mt-0.5 leading-snug">{preview}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div className="border-t border-fm-outline-variant/15 px-5 py-3">
                    <Link
                      href="/portal/agenda-digital"
                      className="text-[13px] font-semibold text-kp-primary hover:underline"
                    >
                      Ver agenda completa →
                    </Link>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Facturación — mobile only ── */}
          {canBilling && (
            <section className="md:hidden flex flex-col gap-3">
              <h3 className="text-[20px] font-bold text-fm-on-surface px-1">Facturación</h3>
              <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] p-6">

                {pendingInvoices > 0 && (
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-kp-secondary-container/10 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-kp-secondary">receipt_long</span>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-fm-on-surface-variant">
                          {pendingInvoices === 1 ? 'Factura pendiente' : 'Facturas pendientes'}
                        </p>
                        <p className="text-[18px] font-bold text-fm-on-surface">${pendingTotal.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="bg-amber-100 text-amber-700 text-[12px] font-semibold px-3 py-1 rounded-full">
                      PENDIENTE
                    </span>
                  </div>
                )}

                {pendingInvoices === 0 && latestPaidInvoice && (
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-kp-secondary-container/10 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-kp-secondary">receipt_long</span>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-fm-on-surface-variant">Última factura</p>
                        <p className="text-[18px] font-bold text-fm-on-surface">
                          ${Number(latestPaidInvoice.total_a_pagar ?? 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <span className="bg-kp-tertiary-container/10 text-kp-tertiary text-[12px] font-semibold px-3 py-1 rounded-full">
                      PAGADO
                    </span>
                  </div>
                )}

                {pendingInvoices === 0 && !latestPaidInvoice && (
                  <p className="text-[14px] text-fm-on-surface-variant text-center py-2 mb-4">
                    Sin facturas registradas.
                  </p>
                )}

                {latestPaidInvoice?.payment_method ? (
                  <div className="flex items-center justify-between p-4 bg-fm-surface-container-low rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-fm-on-surface-variant">credit_card</span>
                      <p className="text-[14px] font-semibold text-fm-on-surface capitalize">
                        {latestPaidInvoice.payment_method.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Link href="/portal/facturas" className="text-kp-primary text-[12px] font-semibold">
                      Ver facturas
                    </Link>
                  </div>
                ) : (
                  <Link
                    href="/portal/facturas"
                    className="flex items-center justify-between p-4 bg-fm-surface-container-low rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-fm-on-surface-variant">receipt</span>
                      <p className="text-[14px] font-semibold text-fm-on-surface">Ver todas las facturas</p>
                    </div>
                    <span className="material-symbols-outlined text-fm-on-surface-variant text-[18px]">
                      chevron_right
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ─── Right column — desktop only ─── */}
        {canBilling && (
          <div className="hidden md:flex md:col-span-4 flex-col">
            <div className="sticky top-28 flex flex-col gap-4">

              {/* Billing widget */}
              <div className="bg-fm-surface-container-lowest border border-fm-outline-variant/20 rounded-[28px] p-6">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-[18px] font-bold text-fm-on-surface">Facturación</h3>
                  <Link href="/portal/facturas" className="text-[12px] font-semibold text-kp-primary hover:underline">
                    Ver todas →
                  </Link>
                </div>

                {pendingInvoices > 0 && (
                  <div className="flex items-center justify-between mb-4 p-3 bg-amber-50 rounded-2xl">
                    <p className="text-[13px] font-semibold text-amber-800">
                      {pendingInvoices === 1 ? '1 factura pendiente' : `${pendingInvoices} facturas pendientes`}
                    </p>
                    <span className="text-[13px] font-bold text-amber-700">${pendingTotal.toFixed(2)}</span>
                  </div>
                )}

                {recentPaidInvoices.length > 0 ? (
                  <div className="flex flex-col">
                    {recentPaidInvoices.map((inv, idx) => (
                      <div
                        key={inv.id}
                        className={`flex items-center justify-between py-3 ${idx > 0 ? 'border-t border-fm-outline-variant/15' : ''}`}
                      >
                        <div className="min-w-0 mr-3">
                          <p className="text-[14px] font-semibold text-fm-on-surface capitalize truncate">
                            {periodLabel(inv.issue_date) || inv.invoice_number || '—'}
                          </p>
                          {inv.invoice_number && (
                            <p className="text-[11px] text-fm-on-surface-variant">{inv.invoice_number}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[14px] font-bold text-fm-on-surface">
                            ${Number(inv.total_a_pagar ?? 0).toFixed(2)}
                          </p>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            PAGADO
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[14px] text-fm-on-surface-variant text-center py-3">
                    Sin facturas recientes.
                  </p>
                )}

                {latestPaidInvoice?.payment_method && (
                  <div className="mt-4 pt-4 border-t border-fm-outline-variant/15 flex items-center gap-2">
                    <span className="material-symbols-outlined text-fm-on-surface-variant text-[18px]">credit_card</span>
                    <p className="text-[13px] text-fm-on-surface capitalize">
                      {latestPaidInvoice.payment_method.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Mini calendario */}
              {canWork && (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-semibold text-fm-on-surface-variant px-1">Calendario</p>
                  <PortalCalendarWidget
                    appointments={calendarAppts}
                    childNamesById={childNamesById}
                  />
                </div>
              )}

              {/* Quick contact */}
              <div className="bg-kp-primary-container/10 border border-kp-primary-container/30 rounded-[28px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-kp-primary rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-kp-on-primary text-[20px]">support_agent</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-fm-on-surface">¿Necesitás ayuda?</p>
                    <p className="text-[12px] text-fm-on-surface-variant">Contactá a Kinetic</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full py-2.5 bg-kp-primary text-kp-on-primary text-[13px] font-semibold rounded-full hover:bg-kp-primary/90 transition-colors"
                >
                  Enviar mensaje
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </>
  )
}
