import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { formatCurrency, formatTaxRate } from '@/lib/domain/invoices'
import type {
  Child,
  ClientFiscalSnapshot,
  EmitterSnapshot,
  Invoice,
  InvoiceItem,
} from '@/types/db'
import { PAYMENT_METHOD_LABELS } from '@/types/db'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:  { label: 'Borrador',  className: 'bg-fm-surface-container text-fm-on-surface-variant' },
  issued: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  paid:   { label: 'Pagada',   className: 'bg-emerald-100 text-emerald-700' },
  void:   { label: 'Anulada',  className: 'bg-fm-surface-container text-fm-on-surface-variant' },
}

export default async function PortalFacturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Verificar permiso can_billing
  const { data: familyUserRow } = await supabase
    .from('family_users')
    .select('can_billing')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()

  if (!familyUserRow?.can_billing) redirect('/portal')

  // Cargar factura (RLS ya filtra por can_billing y children de la familia)
  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!invoiceRow) notFound()
  const invoice = invoiceRow as Invoice

  // Carga el niño para mostrar nombre en la factura
  const { data: childRow } = await supabase
    .from('children')
    .select('id, full_name, preferred_name, family_id')
    .eq('id', invoice.child_id ?? '')
    .maybeSingle()
  const child = childRow as Pick<Child, 'id' | 'full_name' | 'preferred_name' | 'family_id'> | null

  // Items de la factura
  const { data: itemRows } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order')
  const items = (itemRows ?? []) as InvoiceItem[]

  const clientSnap = invoice.client_snapshot_json as ClientFiscalSnapshot
  const emitterSnap = invoice.emitter_snapshot_json as EmitterSnapshot

  const badge = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.issued

  // Período de la factura (a partir de issue_date → primer día del mes)
  function periodLabel(isoDate: string | null): string {
    if (!isoDate) return ''
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-SV', {
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav
        title={periodLabel(invoice.issue_date) || invoice.invoice_number}
        backHref="/portal/facturas"
      />
      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-4">

        {/* Documento */}
        <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-5 md:p-7 space-y-6">

          {/* Cabecera */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant">
                Factura
              </p>
              <h1 className="text-2xl font-bold text-fm-primary mt-1">{invoice.invoice_number}</h1>
              <span className={`inline-block mt-2 text-xs px-2.5 py-0.5 rounded-full font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <div className="text-left md:text-right text-xs text-fm-on-surface-variant">
              <p className="font-semibold text-fm-on-surface">
                {emitterSnap.trade_name ?? emitterSnap.legal_name}
              </p>
              {emitterSnap.fiscal_address && (
                <p className="mt-1 whitespace-pre-line">{emitterSnap.fiscal_address}</p>
              )}
              {emitterSnap.nrc && <p className="mt-1">NRC: {emitterSnap.nrc}</p>}
              {emitterSnap.nit && <p>NIT: {emitterSnap.nit}</p>}
            </div>
          </div>

          {/* Datos clave */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4 border-y border-fm-outline-variant/15 text-xs">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-outline-variant mb-1">
                Facturado a
              </p>
              <p className="font-semibold text-fm-on-surface">
                {clientSnap.legal_name ?? clientSnap.name}
              </p>
              {child && (
                <p className="text-fm-on-surface-variant mt-0.5">
                  {child.preferred_name ?? child.full_name}
                </p>
              )}
              {clientSnap.nit && (
                <p className="text-fm-on-surface-variant mt-0.5">NIT: {clientSnap.nit}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-outline-variant mb-1">
                Fecha de emisión
              </p>
              <p className="text-fm-on-surface">
                {invoice.issue_date
                  ? new Date(invoice.issue_date).toLocaleDateString('es-SV', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-outline-variant mb-1">
                Método de pago
              </p>
              <p className="text-fm-on-surface">
                {invoice.payment_method ? PAYMENT_METHOD_LABELS[invoice.payment_method] : '—'}
              </p>
              {invoice.payment_date && (
                <p className="text-fm-on-surface-variant mt-0.5">
                  {new Date(invoice.payment_date).toLocaleDateString('es-SV', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Líneas */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold text-fm-outline-variant uppercase tracking-wider border-b border-fm-outline-variant/15">
                  <th className="text-left py-2">Descripción</th>
                  <th className="text-right py-2 w-20">Cantidad</th>
                  <th className="text-right py-2 w-28">Precio unit.</th>
                  <th className="text-right py-2 w-28">Total línea</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-fm-outline-variant/10">
                    <td className="py-2.5 text-fm-on-surface">{it.description}</td>
                    <td className="py-2.5 text-right text-fm-on-surface-variant">
                      {Number(it.quantity)}
                    </td>
                    <td className="py-2.5 text-right text-fm-on-surface-variant">
                      {formatCurrency(it.unit_price)}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-fm-on-surface">
                      {formatCurrency(it.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="w-full md:w-64 space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-fm-on-surface-variant">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discount_amount ?? 0) > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Descuento</span>
                  <span>−{formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}
              {invoice.tax_rate !== 0 && (
                <div className="flex items-center justify-between text-fm-on-surface-variant">
                  <span>IVA ({formatTaxRate(invoice.tax_rate)})</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
              )}
              <div className="h-px bg-fm-outline-variant/20 my-2" />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fm-on-surface">Total</span>
                <span className="text-xl font-bold text-fm-primary">
                  {formatCurrency(invoice.total_a_pagar ?? invoice.total)}
                </span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant mb-1.5">
                Notas
              </p>
              <p className="text-sm text-fm-on-surface whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {invoice.status === 'void' && invoice.void_reason && (
            <div className="bg-fm-error/5 border border-fm-error/20 rounded-xl px-3 py-2">
              <p className="text-xs font-semibold text-fm-error uppercase tracking-wider">Factura anulada</p>
              <p className="text-sm text-fm-error mt-1">{invoice.void_reason}</p>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-4 py-2.5 text-sm font-medium text-fm-on-surface hover:bg-fm-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Descargar PDF
          </Link>
          <Link
            href="/portal/facturas"
            className="flex items-center justify-center gap-2 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-4 py-2.5 text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver a facturas
          </Link>
        </div>

      </div>
    </div>
  )
}
