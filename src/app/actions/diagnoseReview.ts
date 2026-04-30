'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ClientReviewDiagnostic {
  requirementFound: boolean
  phase: string | null
  cycleId: string | null
  clientId: string | null
  /** auth.uid() de la sesión actual (para que el admin pueda verificar en client_users). */
  authUid: string | null
  /** Resultado de is_client_of() vía RPC. */
  isClientOf: boolean | null
  /** Filas en client_users para (user_id=authUid, client_id=clientId). Verificación directa sin RPC. */
  clientUsersRows: number
  /** ¿Puede el cliente leer el billing_cycle de este requerimiento? */
  billingCycleVisible: boolean
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
 * Incluye verificación directa de client_users y is_client_of() con parámetro correcto.
 */
export async function diagnoseClientReview(requirementId: string): Promise<ClientReviewDiagnostic> {
  const result: ClientReviewDiagnostic = {
    requirementFound: false,
    phase: null,
    cycleId: null,
    clientId: null,
    authUid: null,
    isClientOf: null,
    clientUsersRows: 0,
    billingCycleVisible: false,
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

    // ── Sesión actual ──────────────────────────────────────────────────
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    result.authUid = sessionUser?.id ?? null

    // ── Requerimiento (sesión del usuario, RLS aplica) ─────────────────
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

    // ── client_id desde billing_cycles (admin) ─────────────────────────
    if (result.cycleId) {
      const { data: cyc, error: cycErr } = await admin
        .from('billing_cycles')
        .select('client_id')
        .eq('id', result.cycleId)
        .maybeSingle()
      if (cycErr) result.adminError = `billing_cycles: ${cycErr.message}`
      result.clientId = cyc?.client_id ?? null
      if (!result.clientId && !cycErr) {
        result.adminError = `billing_cycles: ciclo ${result.cycleId} no encontrado o sin client_id`
      }
    } else if (result.requirementFound) {
      result.adminError = 'requirement.billing_cycle_id es null — el requerimiento no tiene ciclo de facturación asignado'
    }

    // ── is_client_of() vía RPC (parámetro correcto: target_client_id) ──
    if (result.clientId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ico, error: icoErr } = await (supabase as any).rpc('is_client_of', {
        target_client_id: result.clientId,
      })
      if (icoErr) {
        result.selfError = `is_client_of RPC: ${icoErr.message}`
        result.isClientOf = false
      } else {
        result.isClientOf = Boolean(ico)
      }

      // ── ¿Puede el cliente ver el billing_cycle directamente? ──────────
      // Esto valida si el JOIN interno de la RLS policy de review_assets puede funcionar.
      // Si es false, la policy EXISTS(requirements JOIN billing_cycles ...) retorna vacío.
      if (result.cycleId) {
        const { count: bcCount } = await supabase
          .from('billing_cycles')
          .select('id', { count: 'exact', head: true })
          .eq('id', result.cycleId)
        result.billingCycleVisible = (bcCount ?? 0) > 0
      }

      // ── Verificación directa de client_users (admin, bypass RLS) ──────
      if (result.authUid) {
        const { count: cuCount } = await admin
          .from('client_users')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', result.clientId)
          .eq('user_id', result.authUid)
        result.clientUsersRows = cuCount ?? 0
      }
    }

    // ── Conteos: visible (usuario) vs total (admin) ────────────────────
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

    // ── Versiones (solo si hay assets en BD) ──────────────────────────
    if (result.totalAssets > 0) {
      const { data: assetIdsRows } = await admin
        .from('review_assets')
        .select('id')
        .eq('requirement_id', requirementId)
        .is('archived_at', null)
      const ids = (assetIdsRows ?? []).map((r) => r.id as string)
      if (ids.length > 0) {
        const [{ count: vVer }, { count: tVer }] = await Promise.all([
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
