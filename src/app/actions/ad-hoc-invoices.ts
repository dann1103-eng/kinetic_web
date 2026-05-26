'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'

/**
 * Server action para crear "facturas sueltas" — invoices que no vienen del
 * ciclo mensual sino de cargos puntuales (matrícula, materiales, uniforme,
 * evaluaciones, asesorías, pruebas psicológicas, etc.).
 *
 * El usuario selecciona items del service_catalog en un modal en la ficha
 * del niño, y este action crea el invoice + invoice_items en una transacción.
 */

const ALLOWED_ROLES = ['admin', 'directora', 'coordinadora_terapias', 'recepcion', 'contable']

export interface AdHocInvoiceLine {
  /** ID del item en service_catalog (para snapshot + trazabilidad). */
  catalog_item_id: string
  /** Description final (puede sobreescribir el name del item). */
  description: string
  /** Cantidad >= 1. */
  quantity: number
  /** Precio unitario final (puede ser el normal o el BK). */
  unit_price_usd: number
}

export interface CreateAdHocInvoiceInput {
  child_id: string
  lines: AdHocInvoiceLine[]
  /** 'paid' = recepción cobra al momento; 'sent' = pendiente de pago. */
  status: 'paid' | 'sent'
  /** Si status='paid' — método de pago. */
  payment_method?: 'cash' | 'transfer' | 'card' | 'other' | null
  payment_reference?: string | null
  notes?: string | null
}

export async function createAdHocInvoice(
  input: CreateAdHocInvoiceInput,
): Promise<{ ok: true; invoice_id: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para facturar.' }
  }

  // Validaciones
  if (!input.child_id) return { ok: false, error: 'Falta el niño.' }
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: 'Agregá al menos un item al invoice.' }
  }
  for (const line of input.lines) {
    if (line.quantity < 1) return { ok: false, error: 'Cantidad debe ser ≥ 1.' }
    if (line.unit_price_usd < 0) return { ok: false, error: 'Precio negativo.' }
    if (!line.description.trim()) return { ok: false, error: 'Falta descripción en una línea.' }
  }

  const supabase = await createClient()

  // Verificar niño y obtener snapshot
  const { data: child } = await supabase
    .from('children')
    .select('id, full_name, code, family_id')
    .eq('id', input.child_id)
    .maybeSingle()
  if (!child) return { ok: false, error: 'Niño/a no encontrado.' }

  // Subtotal
  const subtotal = input.lines.reduce(
    (sum, l) => sum + l.quantity * l.unit_price_usd,
    0,
  )
  const total = Math.round(subtotal * 100) / 100

  // Número de invoice — Kinetic format: KIN-YYYYMM-XXXX
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const { count: existingCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .not('child_id', 'is', null)
    .gte('issue_date', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const invoiceNumber = `KIN-${yyyymm}-${String((existingCount ?? 0) + 1).padStart(4, '0')}`

  // Snapshots
  const clientSnapshot = {
    child_id: child.id,
    child_full_name: child.full_name,
    child_code: child.code,
    family_id: child.family_id,
  }
  const emitterSnapshot = {
    name: 'Kinetic — Centro de Estimulación y Desarrollo Intelectual',
    note: 'Factura ad-hoc generada desde la ficha del niño',
  }

  // Usamos admin client para bypass de RLS en write (la validación de rol ya
  // se hizo arriba). La regla RLS de invoice_items requiere el invoice padre
  // ya existir, así que esto da consistencia transaccional.
  const admin = createAdminClient()

  const issueDateIso = now.toISOString().slice(0, 10)
  const paymentDateIso = input.status === 'paid' ? issueDateIso : null

  // Cast a Record<string, unknown> porque ClientFiscalSnapshot/EmitterSnapshot
  // tienen tipos estrictos del legacy FM; nuestro snapshot Kinetic es más simple.
  // El admin client bypassea RLS y la BD acepta jsonb arbitrario.
  const invoicePayload = {
    invoice_number: invoiceNumber,
    client_id: null,
    child_id: child.id,
    issue_date: issueDateIso,
    currency: 'USD',
    subtotal,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total,
    total_a_pagar: total,
    status: input.status,
    payment_date: paymentDateIso,
    payment_method: input.payment_method ?? null,
    payment_reference: input.payment_reference ?? null,
    notes: input.notes?.trim() || 'Factura ad-hoc',
    client_snapshot_json: clientSnapshot,
    emitter_snapshot_json: emitterSnapshot,
    created_by: ctx.appUser.id,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoiceData, error: invoiceError } = await (admin as any)
    .from('invoices')
    .insert(invoicePayload)
    .select('id')
    .single()

  if (invoiceError || !invoiceData) {
    return { ok: false, error: invoiceError?.message ?? 'No se pudo crear el invoice.' }
  }

  const invoiceId = invoiceData.id

  // Insertar invoice_items
  const itemsToInsert = input.lines.map((line, idx) => ({
    invoice_id: invoiceId,
    description: line.description.trim(),
    quantity: line.quantity,
    unit_price: line.unit_price_usd,
    line_total: Math.round(line.quantity * line.unit_price_usd * 100) / 100,
    sort_order: idx,
  }))

  const { error: itemsError } = await admin.from('invoice_items').insert(itemsToInsert)

  if (itemsError) {
    // Rollback manual: borrar la invoice si fallan los items.
    await admin.from('invoices').delete().eq('id', invoiceId)
    return { ok: false, error: `Error al crear líneas: ${itemsError.message}` }
  }

  revalidatePath(`/familias/${child.family_id}`)
  revalidatePath(`/familias/${child.family_id}/children/${child.id}`)
  revalidatePath('/portal/facturas')
  return { ok: true, invoice_id: invoiceId }
}
