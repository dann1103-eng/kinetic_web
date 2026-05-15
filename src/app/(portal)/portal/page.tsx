import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  PortalNextAppointmentCard,
  type PortalAppointmentData,
} from '@/components/portal/PortalNextAppointmentCard'
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

function longDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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

type InvRow = {
  id: string
  status: string
  total_a_pagar: number | null
  payment_date: string | null
  issue_date: string | null
  payment_method: string | null
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
      if (appt.therapist_id) {
        const { data: th } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', appt.therapist_id)
          .maybeSingle()
        therapistName = (th as { full_name: string } | null)?.full_name ?? null
      }
      nextAppointment = {
        id: appt.id,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        child_name: childNamesById[appt.child_id] ?? '',
        therapist_name: therapistName,
        service_type: appt.service_type,
      }
    }
  }

  // ── Informes de avance (cards horizontales) ───────────────────────────────
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

  // ── Sesiones recientes (lista) ────────────────────────────────────────────
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

    // Traer el tipo de servicio y terapeuta del appointment relacionado
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
        new Set(
          Object.values(sessionApptMap)
            .map((a) => a.therapist_id)
            .filter(Boolean) as string[],
        ),
      )
      if (therapistIds.length > 0) {
        const { data: therapists } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', therapistIds)
        for (const t of therapists ?? []) {
          sessionTherapistMap[t.id] = t.full_name
        }
      }
    }
  }

  // ── Facturación ───────────────────────────────────────────────────────────
  let latestPaidInvoice: InvRow | null = null
  let pendingInvoices = 0
  let pendingTotal    = 0

  if (canBilling && childIds.length > 0) {
    const { data: invRaw } = await supabase
      .from('invoices')
      .select('id, status, total_a_pagar, payment_date, issue_date, payment_method')
      .in('child_id', childIds)
      .order('issue_date', { ascending: false })
      .limit(10)

    for (const inv of (invRaw ?? []) as InvRow[]) {
      if (inv.status === 'issued') {
        pendingInvoices++
        pendingTotal += Number(inv.total_a_pagar ?? 0)
      }
    }
    latestPaidInvoice =
      ((invRaw ?? []) as InvRow[]).find((i) => i.status === 'paid') ?? null
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Próxima Cita ── */}
      {canWork && (
        <section>
          <PortalNextAppointmentCard appointment={nextAppointment} />
        </section>
      )}

      {/* ── Reportes (informes cuatrimestrales — scroll horizontal) ── */}
      {canWork && progressReports.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-[20px] font-bold text-fm-on-surface">Reportes</h3>
            <Link
              href="/portal/agenda-digital"
              className="text-[14px] font-semibold text-kp-primary"
            >
              Ver todos
            </Link>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-hide -mx-4 px-4">
            {progressReports.map((report, i) => {
              const isEven = i % 2 === 0
              return (
                <div
                  key={report.id}
                  className="min-w-[240px] bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] p-5 snap-start flex-shrink-0"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                      isEven ? 'bg-kp-tertiary-container/10' : 'bg-kp-primary-container/10'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        isEven ? 'text-kp-tertiary' : 'text-kp-primary'
                      }`}
                    >
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
        </section>
      )}

      {/* ── Sesiones Recientes ── */}
      {canWork && sessionReports.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[20px] font-bold text-fm-on-surface px-1">
            Sesiones Recientes
          </h3>

          <div className="flex flex-col gap-3">
            {sessionReports.slice(0, 3).map((report) => {
              const apptData    = report.session_id ? sessionApptMap[report.session_id] : null
              const therapistId = apptData?.therapist_id ?? null
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
                      <span className="material-symbols-outlined text-fm-on-surface-variant text-[20px]">
                        history
                      </span>
                    </div>
                    <div>
                      <p className="text-[16px] font-semibold text-fm-on-surface">
                        {serviceLabel}
                      </p>
                      <p className="text-[12px] font-semibold text-fm-on-surface-variant">
                        {dateLabel}
                        {therapistName && ` • ${therapistName}`}
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
        </section>
      )}

      {/* ── Facturación widget ── */}
      {canBilling && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[20px] font-bold text-fm-on-surface px-1">Facturación</h3>

          <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] p-6">

            {/* Estado: pendiente */}
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
                    <p className="text-[18px] font-bold text-fm-on-surface">
                      ${pendingTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
                <span className="bg-amber-100 text-amber-700 text-[12px] font-semibold px-3 py-1 rounded-full">
                  PENDIENTE
                </span>
              </div>
            )}

            {/* Estado: pagado */}
            {pendingInvoices === 0 && latestPaidInvoice && (
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-kp-secondary-container/10 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-kp-secondary">receipt_long</span>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-fm-on-surface-variant">
                      Última factura
                    </p>
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

            {/* Sin facturas */}
            {pendingInvoices === 0 && !latestPaidInvoice && (
              <p className="text-[14px] text-fm-on-surface-variant text-center py-2 mb-4">
                Sin facturas registradas.
              </p>
            )}

            {/* Método de pago / link a facturas */}
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
    </>
  )
}
