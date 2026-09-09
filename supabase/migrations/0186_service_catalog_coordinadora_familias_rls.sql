-- =============================================================================
-- 0186 — Catálogos: coordinadora_familias puede ver y editar
-- =============================================================================
-- La página /catalogos (precios de cobro + costos internos por terapia, alta y
-- desactivación de artículos) la gestionaban admin/contable/recepción desde la
-- 0135. Se suma `coordinadora_familias`, que ya tiene paridad de gestión en
-- planes de tratamiento (0144/0145), ciclos (0145/0146), reposiciones (0155),
-- usuarios y cuentas de portal.
--
-- La lectura NO cambia: `service_catalog_select` (0107) ya permite SELECT a
-- cualquier usuario autenticado. Acá solo se amplía la ESCRITURA.
--
-- Espejo en código: `CAN_MANAGE_CATALOG_ROLES` (src/types/db.ts), usada por el
-- guard de la página, las Server Actions (service-catalog.ts) y el Sidebar.
-- Si las dos listas se desincronizan, el botón aparece y la escritura falla.
-- current_user_role() ya existe (0117_payroll.sql).
-- =============================================================================

DROP POLICY IF EXISTS service_catalog_admin_write ON public.service_catalog;
DROP POLICY IF EXISTS service_catalog_mgmt_write ON public.service_catalog;
CREATE POLICY service_catalog_mgmt_write ON public.service_catalog
  FOR ALL
  USING (
    public.current_user_role() IN (
      'admin', 'contable', 'recepcion', 'coordinadora_familias'
    )
  )
  WITH CHECK (
    public.current_user_role() IN (
      'admin', 'contable', 'recepcion', 'coordinadora_familias'
    )
  );
