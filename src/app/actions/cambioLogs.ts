'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Anula un cambio registrado y decrementa el contador del requerimiento.
 * Solo admin estricto. El log queda en BD con auditoría completa
 * (voided=true, voided_by_user_id, voided_at) — no se borra.
 */
export async function voidCambioLog(
  logId: string
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

  // 1. Lee el log y valida que no esté ya anulado
  const { data: log, error: logErr } = await supabase
    .from('requirement_cambio_logs')
    .select('id, requirement_id, voided')
    .eq('id', logId)
    .single()
  if (logErr || !log) return { error: 'Cambio no encontrado' }
  if (log.voided) return { error: 'Este cambio ya está anulado' }

  // 2. Lee cambios_count actual del requerimiento
  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('cambios_count, billing_cycle_id')
    .eq('id', log.requirement_id)
    .single()
  if (reqErr || !req) return { error: 'Requerimiento no encontrado' }

  const newCount = Math.max(0, (req.cambios_count ?? 0) - 1)

  // 3. Anula el log (audit trail)
  const { error: voidErr } = await supabase
    .from('requirement_cambio_logs')
    .update({
      voided: true,
      voided_by_user_id: user.id,
      voided_at: new Date().toISOString(),
    })
    .eq('id', logId)
  if (voidErr) return { error: 'No se pudo anular el cambio' }

  // 4. Decrementa el contador (best-effort: si falla por race con otra escritura,
  // el log ya quedó anulado; la próxima operación reconciliará)
  await supabase
    .from('requirements')
    .update({ cambios_count: newCount })
    .eq('id', log.requirement_id)

  // Revalida la ficha del cliente para refrescar barras y badges
  if (req.billing_cycle_id) {
    const { data: cycle } = await supabase
      .from('billing_cycles')
      .select('client_id')
      .eq('id', req.billing_cycle_id)
      .single()
    if (cycle?.client_id) {
      revalidatePath(`/clients/${cycle.client_id}`)
    }
  }

  return { ok: true }
}
