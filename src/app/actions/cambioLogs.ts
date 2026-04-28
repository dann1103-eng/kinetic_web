'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Roles que pueden aprobar/rechazar cambios pendientes. */
const APPROVER_ROLES = ['admin', 'supervisor'] as const

async function getApproverOrError(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ error: string } | { userId: string; role: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!APPROVER_ROLES.includes(appUser?.role as typeof APPROVER_ROLES[number])) {
    return { error: 'Solo un supervisor o admin puede gestionar cambios' as const }
  }
  return { userId: user.id, role: appUser!.role as string }
}

async function revalidateForRequirement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requirementId: string,
) {
  const { data: req } = await supabase
    .from('requirements')
    .select('billing_cycle_id')
    .eq('id', requirementId)
    .single()
  if (req?.billing_cycle_id) {
    const { data: cycle } = await supabase
      .from('billing_cycles')
      .select('client_id')
      .eq('id', req.billing_cycle_id)
      .single()
    if (cycle?.client_id) revalidatePath(`/clients/${cycle.client_id}`)
  }
}

// ─────────────────────────────────────────────
// Aprobar cambio pendiente → lo contabiliza
// ─────────────────────────────────────────────
export async function approveCambioLog(
  logId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const auth = await getApproverOrError(supabase)
  if ('error' in auth) return { error: auth.error }

  const { data: log, error: logErr } = await supabase
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio está anulado' }
  if (log.status === 'approved') return { error: 'Este cambio ya fue aprobado' }
  if (log.status === 'rejected') return { error: 'Este cambio fue rechazado; no se puede aprobar' }

  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('cambios_count, billing_cycle_id')
    .eq('id', log.requirement_id)
    .single()
  if (reqErr || !req) return { error: 'Requerimiento no encontrado' }

  // Marca como aprobado e incrementa contador (best-effort sin tx)
  const { error: updateLogErr } = await supabase
    .from('requirement_cambio_logs')
    .update({ status: 'approved' })
    .eq('id', logId)
  if (updateLogErr) return { error: 'No se pudo aprobar el cambio' }

  await supabase
    .from('requirements')
    .update({ cambios_count: (req.cambios_count ?? 0) + 1 })
    .eq('id', log.requirement_id)

  await revalidateForRequirement(supabase, log.requirement_id)
  return { ok: true }
}

// ─────────────────────────────────────────────
// Rechazar cambio pendiente → no se contabiliza
// ─────────────────────────────────────────────
export async function rejectCambioLog(
  logId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const auth = await getApproverOrError(supabase)
  if ('error' in auth) return { error: auth.error }

  const { data: log, error: logErr } = await supabase
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio está anulado' }
  if (log.status === 'rejected') return { error: 'Este cambio ya fue rechazado' }
  if (log.status === 'approved') return { error: 'Este cambio ya fue aprobado; usa "Anular" en su lugar' }

  const { error: updateErr } = await supabase
    .from('requirement_cambio_logs')
    .update({ status: 'rejected' })
    .eq('id', logId)
  if (updateErr) return { error: 'No se pudo rechazar el cambio' }

  await revalidateForRequirement(supabase, log.requirement_id)
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

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (appUser?.role !== 'admin') {
    return { error: 'Solo el admin puede anular cambios' }
  }

  const { data: log, error: logErr } = await supabase
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided, status')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio ya está anulado' }
  if (log.status === 'pending') return { error: 'Este cambio está pendiente de aprobación; recházalo en lugar de anularlo' }
  if (log.status === 'rejected') return { error: 'Este cambio ya fue rechazado' }

  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('cambios_count, billing_cycle_id')
    .eq('id', log.requirement_id)
    .single()
  if (reqErr || !req) return { error: 'Requerimiento no encontrado' }

  const newCount = Math.max(0, (req.cambios_count ?? 0) - 1)

  const { error: voidErr } = await supabase
    .from('requirement_cambio_logs')
    .update({
      voided: true,
      voided_by_user_id: user.id,
      voided_at: new Date().toISOString(),
    })
    .eq('id', logId)
  if (voidErr) return { error: 'No se pudo anular el cambio' }

  await supabase
    .from('requirements')
    .update({ cambios_count: newCount })
    .eq('id', log.requirement_id)

  await revalidateForRequirement(supabase, log.requirement_id)
  return { ok: true }
}
