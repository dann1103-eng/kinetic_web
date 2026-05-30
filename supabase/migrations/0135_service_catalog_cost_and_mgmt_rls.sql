-- =============================================================================
-- 0135 — Catálogo de costos + escritura para admin/contable/recepción
-- =============================================================================
-- Feature "Catálogos" (precios + costos):
--   1) Nueva columna service_catalog.cost_usd: COSTO interno por terapia
--      (lo que se le paga a la terapista). Alimenta el pago por terapia de
--      contratos 'por_terapias' y las terapias EXTRA de 'mensual_fijo'.
--   2) La escritura del catálogo pasa de solo-admin a admin/contable/recepción
--      (la página Catálogos la gestionan esos tres roles).
-- current_user_role() ya existe (0117_payroll.sql).
-- =============================================================================

ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS cost_usd numeric(10, 2);

COMMENT ON COLUMN public.service_catalog.cost_usd IS
  'Costo interno por sesión/terapia (pago a terapista). Alimenta planilla por_terapias y terapias extra.';

-- ── RLS: escritura para admin / contable / recepción ──
DROP POLICY IF EXISTS service_catalog_admin_write ON public.service_catalog;
DROP POLICY IF EXISTS service_catalog_mgmt_write ON public.service_catalog;
CREATE POLICY service_catalog_mgmt_write ON public.service_catalog
  FOR ALL
  USING (public.current_user_role() IN ('admin', 'contable', 'recepcion'))
  WITH CHECK (public.current_user_role() IN ('admin', 'contable', 'recepcion'));
