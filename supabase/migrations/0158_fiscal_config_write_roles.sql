-- =============================================================================
-- 0158 — RLS: recepcion y contable pueden escribir la configuracion fiscal
-- =============================================================================
-- La politica payroll_fiscal_config_write solo permitia admin (mig 0117 + 0119).
-- El rol en codigo (PAYROLL_ROLES en payroll.ts) ya incluia a directora,
-- contable y recepcion, pero la DB rechazaba el INSERT con "violates row-level
-- security policy". Se amplia la politica para que coincida con el codigo.
-- =============================================================================

DROP POLICY IF EXISTS payroll_fiscal_config_write ON public.payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_write ON public.payroll_fiscal_config
  FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

-- ── Fin de migracion 0158 ───────────────────────────────────────────────────
