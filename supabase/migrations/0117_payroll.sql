-- Migración 0117 — Módulo de Planillas (payroll) Kinetic
--
-- Estructura para Fase 8 del plan estratégico: gestión de planillas mensuales
-- con cálculo automático de ISSS, AFP e ISR (El Salvador), sellado de período
-- (immutable tras cerrar), y firma digital del empleado al recibir su recibo.
--
-- Tablas nuevas:
--   payroll_fiscal_config   — constantes legales SV (versionadas por effective_from)
--   payroll_runs            — una fila por planilla mensual (cabecera)
--   payroll_items           — una fila por empleado dentro de una planilla
--
-- Columnas nuevas en users: campos salariales y fiscales.

-- ──────────────────────────────────────────────────────────────────────────
-- USERS — campos salariales y fiscales (todos nullable para retro-compat)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_salary_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate_usd    numeric(10,2),
  ADD COLUMN IF NOT EXISTS contract_type      text
    NOT NULL DEFAULT 'sin_contrato'
    CHECK (contract_type IN ('mensual_fijo', 'por_hora', 'sin_contrato')),
  ADD COLUMN IF NOT EXISTS dui                text,
  ADD COLUMN IF NOT EXISTS isss_number        text,
  ADD COLUMN IF NOT EXISTS afp_number         text,
  ADD COLUMN IF NOT EXISTS afp_provider       text
    CHECK (afp_provider IS NULL OR afp_provider IN ('crecer', 'confia')),
  ADD COLUMN IF NOT EXISTS hire_date          date;

COMMENT ON COLUMN users.monthly_salary_usd IS 'Salario base mensual fijo en USD. Null si contract_type != mensual_fijo.';
COMMENT ON COLUMN users.hourly_rate_usd    IS 'Tarifa por hora opcional para horas extras o contratos por hora.';
COMMENT ON COLUMN users.contract_type      IS 'mensual_fijo | por_hora | sin_contrato (default: no entra en planillas).';
COMMENT ON COLUMN users.dui                IS 'Documento Único de Identidad (formato libre 9 dígitos con guión).';
COMMENT ON COLUMN users.isss_number        IS 'Número de afiliación al ISSS.';
COMMENT ON COLUMN users.afp_number         IS 'Número único previsional (NUP) o equivalente.';
COMMENT ON COLUMN users.afp_provider       IS 'crecer | confia. Solo informativo para reportes.';
COMMENT ON COLUMN users.hire_date          IS 'Fecha de contratación. Útil para calcular aguinaldo y antigüedad.';

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_fiscal_config — constantes legales SV (versionadas)
-- ──────────────────────────────────────────────────────────────────────────
-- Una sola fila "activa" a la vez: la de mayor effective_from <= now().
-- Permite tener historial cuando cambien las leyes y mantener planillas
-- antiguas con sus números originales.

CREATE TABLE IF NOT EXISTS payroll_fiscal_config (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from         date NOT NULL,
  isss_employee_rate     numeric(6,4) NOT NULL,   -- 0.0300 = 3%
  isss_employer_rate     numeric(6,4) NOT NULL,   -- 0.0750 = 7.5%
  isss_cap_salary_usd    numeric(10,2) NOT NULL,  -- 1000.00
  afp_employee_rate      numeric(6,4) NOT NULL,   -- 0.0725
  afp_employer_rate      numeric(6,4) NOT NULL,   -- 0.0875
  afp_cap_salary_usd     numeric(10,2),           -- null = sin tope para MVP
  isr_brackets_json      jsonb NOT NULL,
    -- [
    --   { "from": 0, "to": 472, "rate": 0, "fixed": 0, "baseSubtract": 0 },
    --   { "from": 472.01, "to": 895.24, "rate": 0.10, "fixed": 17.67, "baseSubtract": 472 },
    --   { "from": 895.25, "to": 2038.10, "rate": 0.20, "fixed": 60, "baseSubtract": 895.24 },
    --   { "from": 2038.11, "to": null, "rate": 0.30, "fixed": 288.57, "baseSubtract": 2038.10 }
    -- ]
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid REFERENCES users(id),
  UNIQUE (effective_from)
);

COMMENT ON TABLE payroll_fiscal_config IS 'Constantes legales SV para cálculo de planilla. Versionable por effective_from.';

-- Seed con valores vigentes 2024-2026 (verificar con contador antes de planillas reales).
INSERT INTO payroll_fiscal_config (
  effective_from,
  isss_employee_rate, isss_employer_rate, isss_cap_salary_usd,
  afp_employee_rate, afp_employer_rate, afp_cap_salary_usd,
  isr_brackets_json,
  notes
)
VALUES (
  '2024-01-01',
  0.03, 0.075, 1000.00,
  0.0725, 0.0875, NULL,
  '[
    {"from": 0,       "to": 472,    "rate": 0.0,  "fixed": 0,      "baseSubtract": 0},
    {"from": 472.01,  "to": 895.24, "rate": 0.10, "fixed": 17.67,  "baseSubtract": 472},
    {"from": 895.25,  "to": 2038.10,"rate": 0.20, "fixed": 60.00,  "baseSubtract": 895.24},
    {"from": 2038.11, "to": null,   "rate": 0.30, "fixed": 288.57, "baseSubtract": 2038.10}
  ]'::jsonb,
  'Valores referenciales 2024-2026 (verificar con contador). ISSS 3%/7.5% tope $1000. AFP 7.25%/8.75% sin tope. ISR 4 tramos progresivos sobre base = bruto - ISSS - AFP.'
)
ON CONFLICT (effective_from) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_runs — cabecera de planilla mensual
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year              int NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month             int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sealed', 'paid', 'cancelled')),
  fiscal_config_snapshot_json jsonb,   -- llenado al sellar (status='sealed')
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by_user_id       uuid REFERENCES users(id),
  sealed_at                timestamptz,
  sealed_by_user_id        uuid REFERENCES users(id),
  paid_at                  timestamptz,
  paid_by_user_id          uuid REFERENCES users(id),
  cancelled_at             timestamptz,
  cancelled_by_user_id     uuid REFERENCES users(id),
  cancel_reason            text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payroll_runs IS 'Cabecera de planilla mensual. Una por mes (active = status != cancelled).';

-- Una sola planilla activa por (año, mes). Permite múltiples canceladas.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_active_unique
  ON payroll_runs (period_year, period_month)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS payroll_runs_period_idx
  ON payroll_runs (period_year DESC, period_month DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trg_payroll_runs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_runs_updated_at ON payroll_runs;
CREATE TRIGGER payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_runs_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_items — una fila por empleado en una planilla
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id           uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users(id),

  -- Snapshot del usuario al momento de sellar (jsonb con: full_name, dui,
  -- isss_number, afp_number, afp_provider, role, contract_type)
  user_snapshot_json       jsonb,

  -- Entradas
  base_salary_usd          numeric(10,2) NOT NULL DEFAULT 0,
  extra_hours              numeric(8,2)  NOT NULL DEFAULT 0,
  extra_hours_rate_usd     numeric(10,2),                 -- snapshot del hourly_rate
  extra_hours_amount_usd   numeric(10,2) NOT NULL DEFAULT 0,
  bonus_usd                numeric(10,2) NOT NULL DEFAULT 0,    -- bono o pago adicional
  other_deductions_usd     numeric(10,2) NOT NULL DEFAULT 0,    -- p.ej. anticipo de salario

  -- Cálculos
  gross_total_usd          numeric(10,2) NOT NULL DEFAULT 0,
  isss_employee_usd        numeric(10,2) NOT NULL DEFAULT 0,
  afp_employee_usd         numeric(10,2) NOT NULL DEFAULT 0,
  isr_usd                  numeric(10,2) NOT NULL DEFAULT 0,
  total_deductions_usd     numeric(10,2) NOT NULL DEFAULT 0,
  net_pay_usd              numeric(10,2) NOT NULL DEFAULT 0,

  -- Aportes patronales (no afectan al neto del empleado, pero se reportan)
  isss_employer_usd        numeric(10,2) NOT NULL DEFAULT 0,
  afp_employer_usd         numeric(10,2) NOT NULL DEFAULT 0,
  employer_cost_usd        numeric(10,2) NOT NULL DEFAULT 0,    -- gross + isss_emp + afp_emp

  -- Métricas opcionales (informativas, para validar el sueldo si es por horas)
  hours_worked_from_appointments numeric(8,2),
  hours_worked_from_sessions     numeric(8,2),

  notes                    text,

  -- Firma del empleado
  signed_at                timestamptz,
  signed_ip                text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (payroll_run_id, user_id)
);

COMMENT ON TABLE payroll_items IS 'Detalle de planilla por empleado.';

CREATE INDEX IF NOT EXISTS payroll_items_user_idx ON payroll_items (user_id);
CREATE INDEX IF NOT EXISTS payroll_items_run_idx  ON payroll_items (payroll_run_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_payroll_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_items_updated_at ON payroll_items;
CREATE TRIGGER payroll_items_updated_at
  BEFORE UPDATE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_items_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — Row Level Security
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items         ENABLE ROW LEVEL SECURITY;

-- Helper: rol del usuario actual
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ── payroll_fiscal_config ──
DROP POLICY IF EXISTS payroll_fiscal_config_select ON payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_select ON payroll_fiscal_config
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_fiscal_config_write ON payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_write ON payroll_fiscal_config
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ── payroll_runs: solo admin/directora/contable ──
DROP POLICY IF EXISTS payroll_runs_select ON payroll_runs;
CREATE POLICY payroll_runs_select ON payroll_runs
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_insert ON payroll_runs;
CREATE POLICY payroll_runs_insert ON payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_update ON payroll_runs;
CREATE POLICY payroll_runs_update ON payroll_runs
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_delete ON payroll_runs;
CREATE POLICY payroll_runs_delete ON payroll_runs
  FOR DELETE TO authenticated
  USING (current_user_role() = 'admin' AND status = 'draft');

-- ── payroll_items: admin/directora/contable + empleado lee SU item ──
DROP POLICY IF EXISTS payroll_items_select ON payroll_items;
CREATE POLICY payroll_items_select ON payroll_items
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'directora', 'contable')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS payroll_items_insert ON payroll_items;
CREATE POLICY payroll_items_insert ON payroll_items
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_items_update_admin ON payroll_items;
CREATE POLICY payroll_items_update_admin ON payroll_items
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

-- Empleado puede firmar SU item (UPDATE solo permitido vía RPC, ver abajo)

DROP POLICY IF EXISTS payroll_items_delete ON payroll_items;
CREATE POLICY payroll_items_delete ON payroll_items
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

-- ──────────────────────────────────────────────────────────────────────────
-- RPC sign_my_payroll_item — empleado firma recepción de su recibo
-- ──────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER para evitar política de UPDATE adicional. Solo permite
-- al dueño del item firmar, y solo si el run está sealed o paid.

CREATE OR REPLACE FUNCTION sign_my_payroll_item(p_item_id uuid, p_signed_ip text)
RETURNS payroll_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item payroll_items;
  v_run  payroll_runs;
BEGIN
  SELECT * INTO v_item FROM payroll_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;
  IF v_item.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_item.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_signed';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = v_item.payroll_run_id;
  IF v_run.status NOT IN ('sealed', 'paid') THEN
    RAISE EXCEPTION 'run_not_sealed';
  END IF;

  UPDATE payroll_items
    SET signed_at = now(),
        signed_ip = COALESCE(p_signed_ip, signed_ip)
    WHERE id = p_item_id
    RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION sign_my_payroll_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_my_payroll_item(uuid, text) TO authenticated;
