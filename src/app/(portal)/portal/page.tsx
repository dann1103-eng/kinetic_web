import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import type { Appointment, Child } from '@/types/db'

export const dynamic = 'force-dynamic'

// Formatea "YYYY-MM-DD" como "lunes 14 de mayo" en es-SV
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// Formatea timestamp ISO a hora local "HH:MM"
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default async function PortalHomePage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Cargar permisos del usuario familiar
  const { data: familyUserRow } = await supabase
    .from('family_users')
    .select('can_billing, can_work, family_id')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()

  const canWork = familyUserRow?.can_work ?? true
  const canBilling = familyUserRow?.can_billing ?? false

  // Niños de la familia (para mostrar nombres)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')
  const children = (childrenRaw ?? []) as Pick<Child, 'id' | 'full_name' | 'preferred_name'>[]
  const childIds = children.map((c) => c.id)
  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.preferred_name ?? c.full_name]),
  )

  // Próxima cita (solo 1)
  let nextAppointment: (Appointment & { child_name?: string; therapist_name?: string }) | null = null
  if (canWork && childIds.length > 0) {
    const nowIso = new Date().toISOString()
    const { data: apptRaw } = await supabase
      .from('appointments')
      .select('id, child_id, starts_at, ends_at, service_type, therapist_id, status')
      .in('child_id', childIds)
      .in('status', ['scheduled', 'in_progress', 'replacement'])
      .gte('starts_at', nowIso)
      .order('starts_at')
      .limit(1)
      .maybeSingle()

    if (apptRaw) {
      const appt = apptRaw as Appointment
      let therapistName: string | undefined
      if (appt.therapist_id) {
        const { data: th } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', appt.therapist_id)
          .maybeSingle()
        therapistName = (th as { full_name: string } | null)?.full_name
      }
      nextAppointment = {
        ...appt,
        child_name: childNamesById[appt.child_id] ?? '',
        therapist_name: therapistName,
      }
    }
  }

  // Último reporte de sesión visible a la familia
  type LatestReport = {
    id: string
    child_id: string
    sent_to_family_at: string | null
    actividades: string
  }
  let latestReport: LatestReport | null = null
  if (canWork && childIds.length > 0) {
    const { data: rptRaw } = await supabase
      .from('session_reports')
      .select('id, child_id, sent_to_family_at, actividades')
      .in('child_id', childIds)
      .eq('status', 'sent_to_family')
      .eq('visible_to_family', true)
      .order('sent_to_family_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestReport = rptRaw as LatestReport | null
  }

  // Resumen de facturación: facturas pendientes + total adeudado
  type InvSummary = { id: string; invoice_number: string; status: string; total_a_pagar: number; payment_date: string | null }
  let pendingInvoices: number = 0
  let pendingTotal: number = 0
  let latestPaidInvoice: InvSummary | null = null
  if (canBilling && childIds.length > 0) {
    const { data: invRaw } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_a_pagar, payment_date')
      .in('child_id', childIds)
      .order('issue_date', { ascending: false })

    const invs = (invRaw ?? []) as InvSummary[]
    for (const inv of invs) {
      if (inv.status === 'issued') {
        pendingInvoices++
        pendingTotal += Number(inv.total_a_pagar ?? 0)
      }
    }
    latestPaidInvoice = invs.find((i) => i.status === 'paid') ?? null
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Inicio" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-5">

        {/* Próxima cita */}
        {canWork && (
          <section>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fm-on-surface-variant/70 mb-3">
              Próxima cita
            </p>
            {nextAppointment ? (
              <Link
                href="/portal/agenda"
                className="block bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 hover:bg-fm-surface-container transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-fm-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-fm-primary text-lg">calendar_today</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fm-on-surface capitalize">
                      {formatDate(nextAppointment.starts_at)}
                    </p>
                    <p className="text-sm text-fm-on-surface-variant mt-0.5">
                      {formatTime(nextAppointment.starts_at)}
                      {nextAppointment.ends_at && ` – ${formatTime(nextAppointment.ends_at)}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {nextAppointment.child_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
                          {nextAppointment.child_name}
                        </span>
                      )}
                      {nextAppointment.therapist_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-fm-surface-container text-fm-on-surface-variant">
                          {nextAppointment.therapist_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-fm-outline text-base self-center">chevron_right</span>
                </div>
              </Link>
            ) : (
              <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 text-center">
                <p className="text-sm text-fm-on-surface-variant">Sin citas próximas programadas.</p>
              </div>
            )}
          </section>
        )}

        {/* Último reporte */}
        {canWork && latestReport && (
          <section>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fm-on-surface-variant/70 mb-3">
              Último reporte
            </p>
            <Link
              href="/portal/agenda-digital"
              className="block bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 hover:bg-fm-surface-container transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-fm-secondary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-fm-secondary text-lg">assignment</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fm-on-surface">
                    Reporte de {childNamesById[latestReport.child_id] ?? 'niño/a'}
                  </p>
                  {latestReport.sent_to_family_at && (
                    <p className="text-xs text-fm-on-surface-variant mt-0.5">
                      {new Date(latestReport.sent_to_family_at).toLocaleDateString('es-SV', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  {latestReport.actividades && (
                    <p className="text-xs text-fm-on-surface-variant mt-1.5 line-clamp-2">
                      {latestReport.actividades}
                    </p>
                  )}
                </div>
                <span className="material-symbols-outlined text-fm-outline text-base self-center">chevron_right</span>
              </div>
            </Link>
          </section>
        )}

        {/* Facturación */}
        {canBilling && (
          <section>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fm-on-surface-variant/70 mb-3">
              Facturación
            </p>
            <Link
              href="/portal/facturas"
              className="block bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 hover:bg-fm-surface-container transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${pendingInvoices > 0 ? 'bg-amber-100' : 'bg-fm-surface-container'}`}>
                  <span className={`material-symbols-outlined text-lg ${pendingInvoices > 0 ? 'text-amber-600' : 'text-fm-outline'}`}>
                    receipt_long
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  {pendingInvoices > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-fm-on-surface">
                        {pendingInvoices} {pendingInvoices === 1 ? 'factura pendiente' : 'facturas pendientes'}
                      </p>
                      <p className="text-sm text-amber-600 font-medium mt-0.5">
                        Total: ${pendingTotal.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-fm-on-surface">Sin facturas pendientes</p>
                      {latestPaidInvoice && (
                        <p className="text-xs text-fm-on-surface-variant mt-0.5">
                          Último pago: ${Number(latestPaidInvoice.total_a_pagar ?? 0).toFixed(2)}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <span className="material-symbols-outlined text-fm-outline text-base">chevron_right</span>
              </div>
            </Link>
          </section>
        )}

        {/* Accesos directos */}
        {canWork && (
          <section>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fm-on-surface-variant/70 mb-3">
              Accesos directos
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/portal/agenda"
                className="flex flex-col items-center gap-2 p-4 bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 hover:bg-fm-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-fm-primary text-2xl">calendar_today</span>
                <span className="text-xs font-medium text-fm-on-surface">Ver citas</span>
              </Link>
              <Link
                href="/portal/agenda-digital"
                className="flex flex-col items-center gap-2 p-4 bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 hover:bg-fm-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-fm-secondary text-2xl">menu_book</span>
                <span className="text-xs font-medium text-fm-on-surface">Agenda digital</span>
              </Link>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
