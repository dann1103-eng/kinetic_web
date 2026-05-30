-- ============================================================================
-- 0119_recepcion_reportes_rls.sql
-- Recepción gestiona/visualiza toda la contabilidad (egresos + planillas).
-- Se le otorga paridad con 'contable' en las políticas RLS de:
--   general_expenses, payroll_fiscal_config (solo lectura),
--   payroll_runs, payroll_items.
-- La escritura de configuración fiscal sigue siendo solo admin (sin cambios).
-- current_user_role() ya existe (0117_payroll.sql).
-- ============================================================================

-- ── general_expenses: admin/directora/contable/recepcion ──
DROP POLICY IF EXISTS general_expenses_select ON general_expenses;
CREATE POLICY general_expenses_select ON general_expenses
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS general_expenses_insert ON general_expenses;
CREATE POLICY general_expenses_insert ON general_expenses
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS general_expenses_update ON general_expenses;
CREATE POLICY general_expenses_update ON general_expenses
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS general_expenses_delete ON general_expenses;
CREATE POLICY general_expenses_delete ON general_expenses
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

-- ── payroll_fiscal_config: lectura para recepción (escritura sigue admin) ──
DROP POLICY IF EXISTS payroll_fiscal_config_select ON payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_select ON payroll_fiscal_config
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

-- ── payroll_runs: admin/directora/contable/recepcion ──
DROP POLICY IF EXISTS payroll_runs_select ON payroll_runs;
CREATE POLICY payroll_runs_select ON payroll_runs
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS payroll_runs_insert ON payroll_runs;
CREATE POLICY payroll_runs_insert ON payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS payroll_runs_update ON payroll_runs;
CREATE POLICY payroll_runs_update ON payroll_runs
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

-- (payroll_runs_delete sigue siendo solo admin + status='draft' — sin cambios)

-- ── payroll_items: admin/directora/contable/recepcion + empleado lee SU item ──
DROP POLICY IF EXISTS payroll_items_select ON payroll_items;
CREATE POLICY payroll_items_select ON payroll_items
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'directora', 'contable', 'recepcion')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS payroll_items_insert ON payroll_items;
CREATE POLICY payroll_items_insert ON payroll_items
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS payroll_items_update_admin ON payroll_items;
CREATE POLICY payroll_items_update_admin ON payroll_items
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));

DROP POLICY IF EXISTS payroll_items_delete ON payroll_items;
CREATE POLICY payroll_items_delete ON payroll_items
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable', 'recepcion'));
