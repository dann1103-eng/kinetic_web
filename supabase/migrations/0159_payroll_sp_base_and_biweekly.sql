-- =============================================================================
-- 0159 — Salario base de servicios profesionales + planillas quincenales
-- =============================================================================
-- 1) users.professional_services_base_usd: base fija mensual que se paga por la
--    planilla de SERVICIOS PROFESIONALES (honorarios), aparte de las terapias/
--    evaluaciones que se le sumen. Independiente del monthly_salary_usd (que es
--    para la planilla normal). Cubre a quien aun no esta formal en la empresa
--    pero recibe un fijo por SP, y a quien tiene fijo SP + extras.
--
-- 2) payroll_runs.period_half: NULL = planilla mensual (todo el mes); 1 = primera
--    quincena (dias 1-15); 2 = segunda quincena (dia 16 al fin de mes). Permite
--    pagar quincenalmente. El indice unico pasa a incluir la quincena para que
--    coexistan ambas quincenas (y/o la mensual) por (anio, mes, tipo).
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS professional_services_base_usd numeric(10,2);

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS period_half smallint;

ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_period_half_check;
ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_period_half_check
  CHECK (period_half IS NULL OR period_half IN (1, 2));

-- Indice unico: una planilla activa por (anio, mes, tipo, quincena). coalesce(.,0)
-- trata la mensual (NULL) como su propia ranura, distinta de quincena 1 y 2.
DROP INDEX IF EXISTS payroll_runs_active_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_active_unique
  ON public.payroll_runs (period_year, period_month, payroll_type, coalesce(period_half, 0))
  WHERE status <> 'cancelled';

-- ── Fin de migracion 0159 ───────────────────────────────────────────────────
