'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { computeLatePickup } from '@/lib/domain/billing/late-pickup'

const MGMT_ROLES = ['admin', 'directora', 'coordinadora_terapias', 'recepcion', 'contable']

async function getActor() {
  const ctx = await getEffectiveUser()
  if (!ctx) return null
  return { id: ctx.appUser.id, role: ctx.appUser.role }
}

export interface PendingDispatch {
  id: string
  child_id: string
  child_name: string
  therapist_id: string | null
  completed_at: string
  snoozed_until: string | null
}

/**
 * Despachos pendientes (terapia finalizada, niño aún no recogido).
 * Terapista ve los suyos; staff de gestión ve todos. Excluye los pospuestos.
 */
export async function listPendingDispatches(): Promise<PendingDispatch[]> {
  const actor = await getActor()
  if (!actor) return []
  const supabase = await createClient()

  let q = supabase
    .from('appointments')
    .select('id, child_id, therapist_id, completed_at, dispatch_snoozed_until')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .is('dispatched_at', null)

  // Terapista/maestra: solo sus citas. Gestión: todas.
  if (!MGMT_ROLES.includes(actor.role)) {
    q = q.eq('therapist_id', actor.id)
  }

  const { data } = await q
  const rows = (data ?? []) as {
    id: string
    child_id: string
    therapist_id: string | null
    completed_at: string
    dispatch_snoozed_until: string | null
  }[]
  if (rows.length === 0) return []

  const childIds = Array.from(new Set(rows.map((r) => r.child_id)))
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .in('id', childIds)
  const nameById = new Map((childrenRaw ?? []).map((c) => [c.id, c.full_name]))

  return rows.map((r) => ({
    id: r.id,
    child_id: r.child_id,
    child_name: nameById.get(r.child_id) ?? 'Niño/a',
    therapist_id: r.therapist_id,
    completed_at: r.completed_at,
    snoozed_until: r.dispatch_snoozed_until,
  }))
}

export interface SuggestedLateFee {
  id: string
  child_id: string
  child_name: string
  family_id: string | null
  starts_at: string
  minutes: number
  feeUsd: number
}

/** Cargos por recogida tardía SUGERIDOS (pendientes de cobrar o perdonar). */
export async function listSuggestedLateFees(): Promise<SuggestedLateFee[]> {
  const actor = await getActor()
  if (!actor || !MGMT_ROLES.includes(actor.role)) return []
  const supabase = await createClient()

  const { data } = await supabase
    .from('appointments')
    .select('id, child_id, starts_at, late_fee_minutes, late_fee_usd')
    .eq('late_fee_status', 'suggested')
    .order('starts_at', { ascending: false })
  const rows = (data ?? []) as {
    id: string
    child_id: string
    starts_at: string
    late_fee_minutes: number | null
    late_fee_usd: number
  }[]
  if (rows.length === 0) return []

  const childIds = Array.from(new Set(rows.map((r) => r.child_id)))
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, family_id')
    .in('id', childIds)
  const byId = new Map((childrenRaw ?? []).map((c) => [c.id, c]))

  return rows.map((r) => {
    const c = byId.get(r.child_id)
    return {
      id: r.id,
      child_id: r.child_id,
      child_name: c?.full_name ?? 'Niño/a',
      family_id: c?.family_id ?? null,
      starts_at: r.starts_at,
      minutes: r.late_fee_minutes ?? 0,
      feeUsd: Number(r.late_fee_usd ?? 0),
    }
  })
}

/** Marca al niño como despachado y calcula el cargo por recogida tardía. */
export async function dispatchChild(
  appointmentId: string,
): Promise<{ ok: true; feeUsd: number; minutes: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'No autenticado.' }
  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, therapist_id, completed_at, dispatched_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (!appt.completed_at) return { ok: false, error: 'La terapia aún no se ha finalizado.' }
  if (appt.dispatched_at) return { ok: true, feeUsd: 0, minutes: 0 }

  const nowISO = new Date().toISOString()
  const { minutes, feeUsd } = computeLatePickup(appt.completed_at, nowISO)
  const status = feeUsd > 0 ? 'suggested' : 'none'

  const admin = createAdminClient()
  const { error } = await admin
    .from('appointments')
    .update({
      dispatched_at: nowISO,
      dispatched_by_user_id: actor.id,
      late_fee_minutes: minutes,
      late_fee_usd: feeUsd,
      late_fee_status: status,
      dispatch_snoozed_until: null,
    })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  // Notificar a admin/directora si hay cargo sugerido (perdonar o cobrar).
  if (feeUsd > 0) {
    const { data: mgmt } = await admin
      .from('users')
      .select('id')
      .in('role', ['admin', 'directora'])
    const { data: child } = await admin
      .from('children')
      .select('full_name')
      .eq('id', appt.child_id)
      .maybeSingle()
    const childName = child?.full_name ?? 'un niño/a'
    const rows = (mgmt ?? []).map((m) => ({
      recipient_user_id: m.id,
      kind: 'late_pickup_fee',
      title: 'Cargo por recogida tardía',
      body: `Recogida tardía de ${childName}: ${minutes} min → $${feeUsd.toFixed(2)} sugerido. Revisá para cobrar o perdonar.`,
      payload_json: { appointment_id: appointmentId, child_id: appt.child_id, fee_usd: feeUsd },
    }))
    if (rows.length > 0) {
      await (admin.from('notifications') as unknown as {
        insert: (v: unknown) => Promise<unknown>
      }).insert(rows)
    }
  }

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  return { ok: true, feeUsd, minutes }
}

/** "El niño no lo han traído aún" → pospone el pop-up (sincronizado). */
export async function snoozeDispatch(
  appointmentId: string,
  minutes = 10,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'No autenticado.' }
  const until = new Date(Date.now() + minutes * 60_000).toISOString()
  const admin = createAdminClient()
  const { error } = await admin
    .from('appointments')
    .update({ dispatch_snoozed_until: until })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Recepción/admin confirma el cargo → se acumula a la factura del ciclo del mes. */
export async function confirmLateFee(
  appointmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor || !MGMT_ROLES.includes(actor.role)) {
    return { ok: false, error: 'No autorizado.' }
  }
  const admin = createAdminClient()

  const { data: appt } = await admin
    .from('appointments')
    .select('id, child_id, starts_at, late_fee_usd, late_fee_status, dispatched_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.late_fee_status === 'charged') return { ok: true }
  const fee = Number(appt.late_fee_usd ?? 0)
  if (fee <= 0) return { ok: false, error: 'Esta cita no tiene cargo por recogida tardía.' }

  // Ciclo del mes de la cita → su factura.
  const period = `${appt.starts_at.slice(0, 7)}-01`
  const { data: cycle } = await admin
    .from('monthly_session_cycles')
    .select('id, invoice_id')
    .eq('child_id', appt.child_id)
    .eq('period_month', period)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (cycle?.invoice_id) {
    const dateLabel = new Date(appt.starts_at).toLocaleDateString('es-SV')
    await admin.from('invoice_items').insert({
      invoice_id: cycle.invoice_id,
      description: `Recogida tardía (${dateLabel})`,
      quantity: 1,
      unit_price: fee,
      line_total: fee,
      sort_order: 98,
    })
    const { data: inv } = await admin
      .from('invoices')
      .select('total, total_a_pagar')
      .eq('id', cycle.invoice_id)
      .maybeSingle()
    if (inv) {
      await admin
        .from('invoices')
        .update({
          total: Number(inv.total ?? 0) + fee,
          total_a_pagar: Number(inv.total_a_pagar ?? 0) + fee,
        })
        .eq('id', cycle.invoice_id)
    }
  }

  const { error } = await admin
    .from('appointments')
    .update({ late_fee_status: 'charged' })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/agenda')
  return { ok: true }
}

/** Recepción/admin perdona el cargo (con justificación). */
export async function waiveLateFee(
  appointmentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor || !MGMT_ROLES.includes(actor.role)) {
    return { ok: false, error: 'No autorizado.' }
  }
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: 'Indicá una justificación.' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('appointments')
    .update({ late_fee_status: 'waived', late_fee_waive_reason: reason.trim() })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/agenda')
  return { ok: true }
}
