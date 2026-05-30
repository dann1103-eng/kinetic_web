import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'
import { OrphanAssignForm } from '@/components/billing/OrphanAssignForm'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { N1coPaymentEvent } from '@/types/db'
import { isBillingManager } from '@/lib/auth/billing-access'

export const dynamic = 'force-dynamic'

export default async function OrphanPaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!isBillingManager(appUser?.role)) redirect('/')

  // Eventos huérfanos: SuccessPayment / SubscriptionPayment sin matched_invoice_id
  const { data: rows } = await supabase
    .from('n1co_payment_events')
    .select('*')
    .in('event_type', ['SuccessPayment', 'SubscriptionPayment'])
    .eq('signature_valid', true)
    .is('matched_invoice_id', null)
    .order('received_at', { ascending: false })
    .limit(50)
  const events = (rows ?? []) as N1coPaymentEvent[]

  // Lista de facturas issued (para el selector de asignación)
  type InvRow = {
    id: string
    invoice_number: string
    total: number
    currency: string
    issue_date: string
    status: string
    client: { id: string; name: string } | null
  }
  const { data: invRows } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, total, currency, issue_date, status,
      client:clients(id, name)
    `)
    .eq('status', 'issued')
    .order('issue_date', { ascending: false })
    .limit(200)

  const invoiceOptions = ((invRows ?? []) as unknown as InvRow[]).map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    total: Number(r.total),
    currency: r.currency,
    issueDate: r.issue_date,
    clientName: r.client?.name ?? '—',
  }))

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Pagos huérfanos n1co" />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-fm-on-surface-variant max-w-2xl">
            Pagos recibidos vía webhook que no se pudieron asociar a ninguna factura
            (típicamente links estáticos pagados por clientes con email distinto al registrado).
            Asigna manualmente a la factura correspondiente.
          </p>
          <Link
            href="/billing"
            className="text-sm text-fm-primary hover:underline"
          >
            ← Volver a facturación
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-fm-outline">check_circle</span>
            <p className="text-sm text-fm-on-surface-variant mt-2">No hay pagos huérfanos pendientes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 grid grid-cols-[1fr_auto] gap-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-amber-500/30">
                      {event.event_type}
                    </span>
                    <span className="text-xs text-fm-on-surface-variant">
                      {format(new Date(event.received_at), "dd MMM yyyy HH:mm", { locale: es })}
                    </span>
                  </div>
                  <div className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                    <p><strong className="text-fm-on-surface">Comprador:</strong> {event.buyer_name ?? '—'}</p>
                    <p><strong className="text-fm-on-surface">Email:</strong> {event.buyer_email ?? '—'}</p>
                    <p><strong className="text-fm-on-surface">Order ID:</strong> {event.order_id ?? '—'}</p>
                    <p><strong className="text-fm-on-surface">Order Reference:</strong> {event.order_reference ?? '—'}</p>
                  </div>
                </div>
                <OrphanAssignForm eventId={event.id} invoices={invoiceOptions} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
