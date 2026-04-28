'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Roles que pueden aprobar/rechazar cambios pendientes. */
const APPROVER_ROLES = ['admin', 'supervisor'] as const

/** Verifica que el llamante sea admin o supervisor. Devuelve userId o error. */
async function getApproverOrError(): Promise<{ error: string } | { userId: string; role: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!APPROVER_ROLES.includes(appUser?.role as typeof APPROVER_ROLES[number])) {
    return { error: 'Solo un supervisor o admin puede gestionar cambios' }
  }
  return { userId: user.id, role: appUser!.role as string }
}

/** Verifica que el llamante esté autenticado. Devuelve userId o error. */
async function getAuthUserOrError(): Promise<{ error: string } | { userId: string; role: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  return { userId: user.id, role: appUser?.role ?? 'operator' }
}

async function revalidateForRequirement(requirementId: string) {
  const admin = createAdminClient()
  // Revalidar pipeline siempre
  revalidatePath('/pipeline')
  // Revalidar página del cliente
  const { data: req } = await admin
    .from('requirements')
    .select('billing_cycle_id')
    .eq('id', requirementId)
    .single()
  if (req?.billing_cycle_id) {
    const { data: cycle } = await admin
      .from('billing_cycles')
      .select('client_id')
      .eq('id', req.billing_cycle_id)
      .single()
    if (cycle?.client_id) revalidatePath(`/clients/${cycle.client_id}`)
  }
}

// ─────────────────────────────────────────────
// Crear cambio — devuelve el log con ID real de BD
// ─────────────────────────────────────────────
export async function addCambioLog(
  requirementId: string,
  notes: string,
): Promise<{ ok: true; log: { id: string; status: 'pending' | 'approved'; created_at: string } } | { error: string }> {
  const auth = await getAuthUserOrError()
  if ('error' in auth) return { error: auth.error }

  const selfApprove = auth.role === 'admin' || auth.role === 'supervisor'
  const status: 'pending' | 'approved' = selfApprove ? 'approved' : 'pending'

  const admin = createAdminClient()

  if (selfApprove) {
    // Leer el contador actual
    const { data: req } = await admin
      .from('requirements')
      .select('cambios_count')
      .eq('id', requirementId)
      .single()

    const { data: inserted, error: insertErr } = await admin
      .from('requirement_cambio_logs')
      .insert({ requirement_id: requirementId, notes, created_by: auth.userId, status: 'approved' })
      .select('id, status, created_at')
      .single()
    if (insertErr || !inserted) return { error: 'No se pudo registrar el cambio' }

    await admin
      .from('requirements')
      .update({ cambios_count: (req?.cambios_count ?? 0) + 1 })
      .eq('id', requirementId)

    await revalidateForRequirement(requirementId)
    return { ok: true, log: { id: inserted.id, status: 'approved', created_at: inserted.created_at } }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from('requirement_cambio_logs')
      .insert({ requirement_id: requirementId, notes, created_by: auth.userId, status: 'pending' })
      .select('id, status, created_at')
      .single()
    if (insertErr || !inserted) return { error: 'No se pudo registrar el cambio' }

    // Notificar a admins/supervisores (revalidar sus vistas)
    await revalidateForRequirement(requirementId)
    return { ok: true, log: { id: inserted.id, status: 'pending', created_at: inserted.created_at } }
  }
}

// ─────────────────────────────────────────────
// Aprobar cambio pendiente → lo contabiliza
// ─────────────────────────────────────────────
export async function approveCambioLog(
  logId: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await getApproverOrError()
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()

  const { data: log, error: logErr } = await admin
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio está anulado' }
  if (log.status === 'approved') return { error: 'Este cambio ya fue aprobado' }
  if (log.status === 'rejected') return { error: 'Este cambio fue rechazado; no se puede aprobar' }

  const { data: req, error: reqErr } = await admin
    .from('requirements')
    .select('cambios_count')
    .eq('id', log.requirement_id)
    .single()
  if (reqErr || !req) return { error: 'Requerimiento no encontrado' }

  const { error: updateLogErr } = await admin
    .from('requirement_cambio_logs')
    .update({ status: 'approved' })
    .eq('id', logId)
  if (updateLogErr) return { error: 'No se pudo aprobar el cambio' }

  await admin
    .from('requirements')
    .update({ cambios_count: (req.cambios_count ?? 0) + 1 })
    .eq('id', log.requirement_id)

  await revalidateForRequirement(log.requirement_id)
  return { ok: true }
}

// ─────────────────────────────────────────────
// Rechazar cambio pendiente → no se contabiliza
// ─────────────────────────────────────────────
export async function rejectCambioLog(
  logId: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await getApproverOrError()
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()

  const { data: log, error: logErr } = await admin
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio está anulado' }
  if (log.status === 'rejected') return { error: 'Este cambio ya fue rechazado' }
  if (log.status === 'approved') return { error: 'Este cambio ya fue aprobado; usa "Anular" en su lugar' }

  const { error: updateErr } = await admin
    .from('requirement_cambio_logs')
    .update({ status: 'rejected' })
    .eq('id', logId)
  if (updateErr) return { error: 'No se pudo rechazar el cambio' }

  await revalidateForRequirement(log.requirement_id)
  return { ok: true }
}

// ─────────────────────────────────────────────
// Anular cambio aprobado → decrementa contador (solo admin)
// ─────────────────────────────────────────────
export async function voidCambioLog(
  logId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin') return { error: 'Solo el admin puede anular cambios' }

  const admin = createAdminClient()

  const { data: log, error: logErr } = await admin
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio ya está anulado' }
  if (log.status === 'pending') return { error: 'Este cambio está pendiente de aprobación; recházalo en lugar de anularlo' }
  if (log.status === 'rejected') return { error: 'Este cambio ya fue rechazado' }

  const { data: req, error: reqErr } = await admin
    .from('requirements')
    .select('cambios_count')
    .eq('id', log.requirement_id)
    .single()
  if (reqErr || !req) return { error: 'Requerimiento no encontrado' }

  const newCount = Math.max(0, (req.cambios_count ?? 0) - 1)

  const { error: voidErr } = await admin
    .from('requirement_cambio_logs')
    .update({ voided: true, voided_by_user_id: user.id, voided_at: new Date().toISOString() })
    .eq('id', logId)
  if (voidErr) return { error: 'No se pudo anular el cambio' }

  await admin.from('requirements').update({ cambios_count: newCount }).eq('id', log.requirement_id)

  await revalidateForRequirement(log.requirement_id)
  return { ok: true }
}
