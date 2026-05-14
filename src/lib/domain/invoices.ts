import type {
  Client,
  ClientFiscalSnapshot,
  CompanySettings,
  EmitterSnapshot,
  Family,
  Plan,
} from '@/types/db'

export interface LineItemInput {
  description: string
  quantity: number
  unit_price: number
  /** FK opcional al item del catálogo de servicios. */
  service_catalog_id?: string | null
  /** Snapshot del code del catálogo (denormalizado para audit). */
  service_code?: string | null
}

export interface LineItemComputed extends LineItemInput {
  line_total: number
  sort_order: number
}

export interface TotalsInput {
  items: LineItemInput[]
  tax_rate: number
  discount_amount?: number
  retention_rate?: number
}

export interface TotalsResult {
  subtotal: number
  discount_amount: number
  tax_amount: number
  retention_rate: number
  retencion_renta_amount: number
  total: number
  total_a_pagar: number
  items: LineItemComputed[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Cálculo fiscal:
 *  - subtotal       = sum(quantity × unit_price)
 *  - taxable        = max(0, subtotal − discount)        ← base imponible (sin renta)
 *  - retencion      = taxable × retention_rate           ← renta retenida
 *  - net            = max(0, taxable − retencion)        ← base neta para el pago
 *  - tax_amount     = taxable × tax_rate                 ← IVA del DTE (sobre base imponible)
 *  - total          = taxable + tax_amount               ← Total en DTE (fiscal)
 *  - total_a_pagar  = net + (net × tax_rate)             ← Lo que cobra el payment link (IVA sobre neto)
 *
 * Ejemplo con descuento y renta:
 *   subtotal $200 − descuento $100 = taxable $100
 *   renta 10% → $10  |  net $90
 *   IVA DTE: $100 × 13% = $13  → Total DTE $113
 *   IVA pago: $90  × 13% = $11.70 → Total a pagar $101.70
 */
export function calculateTotals({ items, tax_rate, discount_amount = 0, retention_rate = 0 }: TotalsInput): TotalsResult {
  const computedItems: LineItemComputed[] = items.map((it, idx) => ({
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: round2(it.quantity * it.unit_price),
    sort_order: idx,
  }))
  const subtotal = round2(computedItems.reduce((acc, it) => acc + it.line_total, 0))
  const discount = round2(Math.max(0, discount_amount))
  const taxable = Math.max(0, subtotal - discount)                    // base imponible
  const retention = round2(taxable * Math.max(0, retention_rate))     // renta retenida
  const net = Math.max(0, taxable - retention)                        // base neta para el pago
  const tax_amount = round2(taxable * tax_rate)                       // IVA del DTE (se traslada al pago)
  const total = round2(taxable + tax_amount)                          // Total en DTE
  const total_a_pagar = round2(net + tax_amount)                      // Total a pagar (mismo IVA trasladado)
  return {
    subtotal,
    discount_amount: discount,
    tax_amount,
    retention_rate: Math.max(0, retention_rate),
    retencion_renta_amount: retention,
    total,
    total_a_pagar,
    items: computedItems,
  }
}

export function buildClientSnapshot(client: Client): ClientFiscalSnapshot {
  return {
    id: client.id,
    name: client.name,
    legal_name: client.legal_name,
    person_type: client.person_type,
    nit: client.nit,
    nrc: client.nrc,
    dui: client.dui,
    fiscal_address: client.fiscal_address,
    giro: client.giro,
    country_code: client.country_code,
    contact_email: client.contact_email,
    contact_phone: client.contact_phone,
  }
}

/**
 * Convierte los datos fiscales de una familia en un ClientFiscalSnapshot
 * para usarlo al emitir facturas de ciclos mensuales de terapia.
 */
export function buildFamilySnapshot(family: Family): ClientFiscalSnapshot {
  return {
    id: family.id,
    name: family.fiscal_legal_name ?? family.primary_contact_name,
    legal_name: family.fiscal_legal_name ?? null,
    person_type: null,
    nit: family.fiscal_nit ?? null,
    nrc: null,
    dui: family.fiscal_dui ?? null,
    fiscal_address: family.fiscal_address ?? null,
    giro: null,
    country_code: 'SV',
    contact_email: family.primary_contact_email ?? null,
    contact_phone: family.primary_contact_phone ?? null,
  }
}

export function buildEmitterSnapshot(settings: CompanySettings): EmitterSnapshot {
  return {
    legal_name: settings.legal_name,
    trade_name: settings.trade_name,
    nit: settings.nit,
    nrc: settings.nrc,
    fiscal_address: settings.fiscal_address,
    giro: settings.giro,
    phone: settings.phone,
    email: settings.email,
    logo_url: settings.logo_url,
    invoice_footer_note: settings.invoice_footer_note,
    payment_methods: settings.payment_methods_json ?? [],
  }
}

/** Paquetes de cambios estándar que siempre aparecen en el catálogo rápido.
 *  La factura registra una sola línea ($25 total). La cantidad real (5 cambios)
 *  queda en `extras_metadata` y se materializa como crédito al pagar. */
export const STANDARD_CAMBIOS_PACKAGES: { label: string; description: string; quantity: number; unit_price: number }[] = [
  { label: 'Paquete de 5 cambios', description: 'Paquete de 5 cambios adicionales', quantity: 1, unit_price: 25 },
]

/**
 * Sugiere ítems por defecto a partir del plan actual del cliente.
 * FM no usa dualidad impl/mensual — una sola línea por plan.
 *
 * Si `half` es 'first' o 'second', el monto se divide entre 2
 * (los clientes biweekly pagan la mitad del plan mensual cada quincena).
 */
export function suggestItemsFromPlan(
  plan: Plan,
  periodLabel?: string,
  half: 'first' | 'second' | null = null,
): LineItemInput[] {
  const label = periodLabel ? `Plan ${plan.name} — ${periodLabel}` : `Plan ${plan.name}`
  const unit_price = half ? Math.round((plan.price_usd / 2) * 100) / 100 : plan.price_usd
  return [
    {
      description: label,
      quantity: 1,
      unit_price,
    },
  ]
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatTaxRate(rate: number): string {
  return `${(rate * 100).toFixed(rate * 100 === Math.floor(rate * 100) ? 0 : 2)}%`
}
