-- =============================================================================
-- 0138 — Planilla por terapia: contract_type 'por_terapias' + citas extra
-- =============================================================================
-- A las terapistas se les paga por terapia, no por hora. Cambios:
--   1) contract_type: 'por_hora' → 'por_terapias' (mensual_fijo y sin_contrato
--      se conservan). Migra las filas existentes.
--   2) appointments.is_extra: marca una terapia como EXTRA (cobertura / sesión
--      adicional). Para terapistas mensual_fijo, las extra se pagan aparte al
--      costo del catálogo. Para por_terapias, TODAS las completadas se pagan.
-- =============================================================================

-- ── 1. contract_type: reemplazar 'por_hora' por 'por_terapias' ──
UPDATE public.users SET contract_type = 'por_terapias' WHERE contract_type = 'por_hora';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_contract_type_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_contract_type_check
  CHECK (contract_type IN ('mensual_fijo', 'por_terapias', 'sin_contrato'));

COMMENT ON COLUMN public.users.contract_type IS
  'mensual_fijo | por_terapias | sin_contrato (default: no entra en planillas).';

-- ── 2. appointments.is_extra ──
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_extra boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointments.is_extra IS
  'Terapia extra (cobertura / adicional). Para mensual_fijo se paga aparte al costo del catálogo.';
