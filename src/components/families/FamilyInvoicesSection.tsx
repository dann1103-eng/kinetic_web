import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Child, Invoice, InvoiceStatus } from '@/types/db'

interface FamilyInvoicesSectionProps {
  familyId: string
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  paid: 'Pagada',
  void: 'Anulada',
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant',
  issued: 'bg-blue-500/10 text-blue-700',
  paid: 'bg-emerald-500/10 text-emerald-700',
  void: 'bg-fm-error/10 text-fm-error',
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Server component: muestra el historial de facturas de todos los niños de la familia.
 * Requiere que `invoices.child_id` esté seteado (facturas Kinetic — migración 0110).
 */
export async function FamilyInvoicesSection({ familyId }: FamilyInvoicesSectionProps) {
  const supabase = await createClient()

  // Obtener todos los niños de la familia
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .eq('family_id', familyId)
    .order('full_name')

  const children = (childrenRaw ?? []) as { id: string; full_name: string }[]

  if (children.length === 0) {
    return null // Sin niños → sin facturas
  }

  const childIds = children.map((c) => c.id)

  // Facturas de todos los niños de la familia
  const { data: invoicesRaw } = await supabase
    .from('invoices')
    .select('id, invoice_number, child_id, issue_date, total_a_pagar, status, payment_date')
    .in('child_id', childIds)
    .order('issue_date', { ascending: false })
    .limit(100)

  const invoices = (invoicesRaw ?? []) as Pick<
    Invoice,
    'id' | 'invoice_number' | 'child_id' | 'issue_date' | 'total_a_pagar' | 'status' | 'payment_date'
  >[]

  const childMap = Object.fromEntries(children.map((c) => [c.id, c.full_name]))

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-fm-on-surface-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-fm-primary">receipt_long</span>
          Historial de facturas
        </h2>
        <Link
          href={`/billing/invoices`}
          className="text-xs text-fm-primary hover:underline underline-offset-2"
        >
          Ver todas →
        </Link>
      </header>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-lowest p-6 text-center">
          <p className="text-sm text-fm-on-surface-variant">
            Esta familia aún no tiene facturas registradas.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-fm-outline-variant/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container-low">
              <tr className="text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                <th className="text-left px-4 py-2 font-semibold">Factura</th>
                <th className="text-left px-4 py-2 font-semibold">Niño/a</th>
                <th className="text-left px-4 py-2 font-semibold">Fecha</th>
                <th className="text-right px-4 py-2 font-semibold">Total</th>
                <th className="text-center px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-fm-outline-variant/10 hover:bg-fm-surface-container-low/40 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-fm-on-surface-variant">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-2.5 text-fm-on-surface font-medium">
                    {inv.child_id ? (childMap[inv.child_id] ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-fm-on-surface-variant whitespace-nowrap">
                    {formatDate(inv.issue_date)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-fm-on-surface tabular-nums">
                    {formatAmount(inv.total_a_pagar)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[inv.status]}`}
                    >
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/billing/invoices/${inv.id}`}
                      className="text-xs font-semibold text-fm-primary hover:underline underline-offset-2"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
