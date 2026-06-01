-- Migración 0142 — Dos tipos de planilla: normal + servicios profesionales
--
-- La empresa maneja dos planillas legalmente distintas:
--   1. NORMAL                 — sueldo fijo, deducciones completas (ISSS/AFP/ISR) + aportes patronales.
--   2. SERVICIOS PROFESIONALES — honorarios, solo retención de renta (10% configurable),
--                                sin ISSS/AFP ni aportes patronales.
--
-- Una persona puede entrar a una, a la otra, o a ambas (sueldo fijo + extras/sábados).
-- La pertenencia se modela con dos flags booleanos independientes en `users`
-- (no se hardcodea ninguna lista). El tipo de planilla vive en `payroll_runs.payroll_type`.
--
-- IMPORTANTE: aplicar manualmente en Supabase Dashboard (no hay migración automática).

-- ──────────────────────────────────────────────────────────────────────────
-- users — flags de pertenencia a cada planilla
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS in_normal_payroll                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_professional_services_payroll boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.in_normal_payroll                IS 'Entra a la planilla normal (sueldo fijo, deducciones completas).';
COMMENT ON COLUMN users.in_professional_services_payroll IS 'Entra a la planilla de servicios profesionales (honorarios, solo retención ISR).';

-- Migración de datos desde el contract_type existente.
-- mensual_fijo → solo normal ; por_terapias → solo servicios profesionales ; sin_contrato → ninguna.
UPDATE users SET in_normal_payroll = true
  WHERE contract_type = 'mensual_fijo';
UPDATE users SET in_professional_services_payroll = true
  WHERE contract_type = 'por_terapias';

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_fiscal_config — tasa de retención de servicios profesionales
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_fiscal_config
  ADD COLUMN IF NOT EXISTS professional_services_isr_rate numeric(6,4) NOT NULL DEFAULT 0.10;

COMMENT ON COLUMN payroll_fiscal_config.professional_services_isr_rate
  IS 'Retención de renta (ISR) para planilla de servicios profesionales. 0.10 = 10%.';

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_runs — tipo de planilla
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS payroll_type text NOT NULL DEFAULT 'normal'
    CHECK (payroll_type IN ('normal', 'servicios_profesionales'));

COMMENT ON COLUMN payroll_runs.payroll_type
  IS 'normal | servicios_profesionales. Define el régimen de deducciones del run.';

-- Reemplazar el índice único: ahora se permite UNA normal + UNA SP por (año, mes).
DROP INDEX IF EXISTS payroll_runs_active_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_active_unique
  ON payroll_runs (period_year, period_month, payroll_type)
  WHERE status <> 'cancelled';

-- ──────────────────────────────────────────────────────────────────────────
-- appointments — motivo de la terapia extra (para la planilla de SP)
-- ──────────────────────────────────────────────────────────────────────────
-- `is_extra` ya existe (mig 0138). Aquí se agrega el motivo, informativo y para reportes.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS extra_reason text
    CHECK (extra_reason IS NULL OR extra_reason IN ('hora_extra', 'sabado', 'cobertura'));

COMMENT ON COLUMN appointments.extra_reason
  IS 'Motivo cuando is_extra = true: hora_extra | sabado | cobertura. Suma a la planilla de servicios profesionales.';
