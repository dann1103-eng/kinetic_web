'use server'

/**
 * Previsualizar lo que se le va a cobrar a una familia por un mes.
 *
 * Solo lectura: la regla de arrastres vive en `computeCarryIns` justamente para
 * poder mirarla sin marcar nada. Toda la lógica está en
 * `buildCycleChargePreview` (domain, con tests); acá solo va el permiso.
 */

import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  buildCycleChargePreview,
  type CycleChargePreview,
} from '@/lib/domain/billing/cycle-charge-preview'

/** Mismo set que gobierna los ciclos (monthly-cycles.ts / cycle-charge-sync.ts). */
const MGMT_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]

export async function getCycleChargePreview(
  cycleId: string,
): Promise<{ ok: true; data: CycleChargePreview } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!MGMT_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Solo admin/directora/coord/recepción/contable.' }
  }

  try {
    const supabase = await createClient()
    const data = await buildCycleChargePreview(supabase, cycleId)
    if (!data) return { ok: false, error: 'Ciclo no encontrado.' }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al armar la vista previa.' }
  }
}
