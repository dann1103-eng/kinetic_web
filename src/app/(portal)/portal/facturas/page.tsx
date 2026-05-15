import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import type { Child, Invoice } from '@/types/db'

export const dynamic = 'force-dynamic'

// Convierte '2026-05-01' → 'mayo 2026'
function periodLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:  { label: 'Borrador',  className: 'bg-fm-surface-container text-fm-on-surface-variant' },
  issued: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  paid:   { label: 'Pagada',   className: 'bg-emerald-100 text-emerald-700' },
  void:   { label: 'Anulada',  className: 'bg-fm-surface-container text-fm-on-surface-variant line-through' },
}

export default async function PortalFacturasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // Verificar permiso can_billing
  const { data: familyUserRow } = await supabase
    .from('family_users')
    .select('can_billing')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle()

  if (!familyUserRow?.can_billing) {
    return (
      <div className="flex flex-col min-h-full bg-fm-background">
        <TopNav title="Facturas" backHref="/portal" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-fm-on-surface-variant text-center max-w-xs">
            El acceso a la sección de facturas no está habilitado para esta cuenta.
            Contactá a Kinetic si creés que esto es un error.
          </p>
        </div>
      </div>
    )
  }

  // Cargar niños de la familia (para mostrar nombres)
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')
  const children = (childrenRaw ?? []) as Pick<Child, 'id' | 'full_name' | 'preferred_name'>[]
  const childIds = children.map((c) => c.id)
  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.preferred_name ?? c.full_name]),
  )

  if (childIds.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-fm-background">
        <TopNav title="Facturas" backHref="/portal" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-fm-on-surface-variant">Sin niños registrados.</p>
        </div>
      </div>
    )
  }

  // Cargar facturas Kinetic de los niños de la familia (RLS ya filtra por can_billing)
  const { data: invRaw } = await supabase
    .from('invoices')
    .select('id, invoice_number, child_id, status, issue_date, subtotal, discount_amount, total_a_pagar, payment_date')
    .in('child_id', childIds)
    .order('issue_date', { ascending: false })

  const invoices = (invRaw ?? []) as (Pick<Invoice,
    'id' | 'invoice_number' | 'child_id' | 'status' | 'issue_date' |
    'subtotal' | 'discount_amount' | 'total_a_pagar' | 'payment_date'>)[]

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Facturas" backHref="/portal" />
      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-4">

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-fm-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-fm-outline-variant mb-3">receipt_long</span>
            <p className="font-medium">Sin facturas registradas</p>
            <p className="text-sm mt-1">Las facturas generadas por Kinetic aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const badge = STATUS_LABELS[inv.status] ?? STATUS_LABELS.issued
              const hasDiscount = Number(inv.discount_amount ?? 0) > 0

              return (
                <Link
                  key={inv.id}
                  href={`/portal/facturas/${inv.id}`}
                  className="flex items-center gap-4 p-4 bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 hover:bg-fm-surface-container transition-colors"
                >
                  {/* Icono estado */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    inv.status === 'paid' ? 'bg-emerald-100' :
                    inv.status === 'issued' ? 'bg-amber-100' :
                    'bg-fm-surface-container'
                  }`}>
                    <span className={`material-symbols-outlined text-lg ${
                      inv.status === 'paid' ? 'text-emerald-600' :
                      inv.status === 'issued' ? 'text-amber-600' :
                      'text-fm-outline'
                    }`}>
                      {inv.status === 'paid' ? 'check_circle' : 'receipt_long'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-fm-on-surface">
                        {inv.issue_date ? periodLabel(inv.issue_date) : inv.invoice_number}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-fm-on-surface-variant mt-0.5">
                      {childNamesById[inv.child_id ?? ''] ?? '—'}
                      {' · '}
                      {inv.invoice_number}
                    </p>
                    {inv.status === 'paid' && inv.payment_date && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Pagada el {new Date(inv.payment_date).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Total */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-fm-on-surface">
                      ${Number(inv.total_a_pagar ?? 0).toFixed(2)}
                    </p>
                    {hasDiscount && (
                      <p className="text-xs text-fm-on-surface-variant line-through">
                        ${Number(inv.subtotal ?? 0).toFixed(2)}
                      </p>
                    )}
                    <span className="material-symbols-outlined text-fm-outline text-base">chevron_right</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
