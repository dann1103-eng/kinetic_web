'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ClientReviewDiagnostic {
  requirementFound: boolean
  phase: string | null
  cycleId: string | null
  clientId: string | null
  isClientOf: boolean | null
  /** Cuenta de review_assets visibles bajo la sesión actual (RLS aplica). */
  visibleAssets: number
  /** Cuenta de review_assets totales en la BD (vista admin, sin RLS). */
  totalAssets: number
  /** Cuenta de review_versions visibles bajo la sesión actual. */
  visibleVersions: number
  /** Cuenta de review_versions totales en la BD. */
  totalVersions: number
  selfError: string | null
  adminError: string | null
}

/**
 * Diagnóstico para el bug del portal de revisión de clientes.
 * Compara lo que ve el usuario (con RLS) vs lo que existe en BD (admin).
 * Si visibleAssets < totalAssets, el problema es RLS.
 */
export async function diagnoseClientReview(requirementId: string): Promise<ClientReviewDiagnostic> {
  const result: ClientReviewDiagnostic = {
    requirementFound: false,
    phase: null,
    cycleId: null,
    clientId: null,
    isClientOf: null,
    visibleAssets: 0,
    totalAssets: 0,
    visibleVersions: 0,
    totalVersions: 0,
    selfError: null,
    adminError: null,
  }

  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Lo que ve la sesión actual
    const { data: req, error: reqErr } = await supabase
      .from('requirements')
      .select('id, phase, billing_cycle_id')
      .eq('id', requirementId)
      .maybeSingle()
    if (reqErr) {
      result.selfError = `requirements: ${reqErr.message}`
    } else if (req) {
      result.requirementFound = true
      result.phase = req.phase as string
      result.cycleId = req.billing_cycle_id as string
    }

    // client_id desde billing_cycles (vía admin para asegurar la lectura)
    if (result.cycleId) {
      const { data: cyc } = await admin
        .from('billing_cycles')
        .select('client_id')
        .eq('id', result.cycleId)
        .maybeSingle()
      result.clientId = cyc?.client_id ?? null
    }

    // is_client_of(client_id) — RPC que ya existe (mig 0052)
    if (result.clientId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ico, error: icoErr } = await (supabase as any).rpc('is_client_of', {
        client_id: result.clientId,
      })
      if (icoErr) {
        result.selfError = `is_client_of: ${icoErr.message}`
      } else {
        result.isClientOf = Boolean(ico)
      }
    }

    // Conteos: visible (usuario) vs total (admin)
    const [
      { count: vAssets, error: vAssErr },
      { count: tAssets, error: tAssErr },
    ] = await Promise.all([
      supabase
        .from('review_assets')
        .select('id', { count: 'exact', head: true })
        .eq('requirement_id', requirementId)
        .is('archived_at', null),
      admin
        .from('review_assets')
        .select('id', { count: 'exact', head: true })
        .eq('requirement_id', requirementId)
        .is('archived_at', null),
    ])
    if (vAssErr) result.selfError = `review_assets: ${vAssErr.message}`
    if (tAssErr) result.adminError = `review_assets (admin): ${tAssErr.message}`
    result.visibleAssets = vAssets ?? 0
    result.totalAssets = tAssets ?? 0

    // Versiones (solo si hay assets en BD)
    if (result.totalAssets > 0) {
      const { data: assetIdsRows } = await admin
        .from('review_assets')
        .select('id')
        .eq('requirement_id', requirementId)
        .is('archived_at', null)
      const ids = (assetIdsRows ?? []).map((r) => r.id as string)
      if (ids.length > 0) {
        const [
          { count: vVer },
          { count: tVer },
        ] = await Promise.all([
          supabase.from('review_versions').select('id', { count: 'exact', head: true }).in('asset_id', ids),
          admin.from('review_versions').select('id', { count: 'exact', head: true }).in('asset_id', ids),
        ])
        result.visibleVersions = vVer ?? 0
        result.totalVersions = tVer ?? 0
      }
    }

    return result
  } catch (e) {
    result.selfError = e instanceof Error ? e.message : 'Error desconocido'
    return result
  }
}
