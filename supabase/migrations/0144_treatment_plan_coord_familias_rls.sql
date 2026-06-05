-- Migración 0144 — Permitir a 'coordinadora_familias' crear/editar planes de tratamiento
--
-- Las políticas de mig 0100 (y 0133, que sumó 'contable') permitían insert/update
-- de treatment_plans y su audit log treatment_plan_changes a
-- admin/directora/coordinadora_terapias/contable. Ahora también
-- coordinadora_familias puede capturar planes (paridad entre coordinadoras).

-- ── treatment_plans: insert ───────────────────────────────────────────────
DROP POLICY IF EXISTS "tp insert mgmt" ON public.treatment_plans;
CREATE POLICY "tp insert mgmt"
  ON public.treatment_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias', 'contable')
    )
  );

-- ── treatment_plans: update ───────────────────────────────────────────────
DROP POLICY IF EXISTS "tp update mgmt" ON public.treatment_plans;
CREATE POLICY "tp update mgmt"
  ON public.treatment_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias', 'contable')
    )
  );

-- ── treatment_plan_changes: insert (audit log) ────────────────────────────
DROP POLICY IF EXISTS "tpc insert mgmt" ON public.treatment_plan_changes;
CREATE POLICY "tpc insert mgmt"
  ON public.treatment_plan_changes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias', 'contable')
    )
  );
