-- Migración 0118 — Egresos / gastos generales Kinetic
--
-- Tabla para registrar gastos operativos del centro que NO son planilla:
-- renta, servicios públicos (luz/agua/internet/teléfono), transporte,
-- suscripciones de software, material didáctico, mantenimiento, marketing,
-- impuestos no-laborales, etc.
--
-- Las planillas (payroll_runs + payroll_items) se agregan aparte en los
-- reportes de egresos. Esta tabla solo es para "todo lo demás".

CREATE TABLE IF NOT EXISTS general_expenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category            text NOT NULL
    CHECK (category IN (
      'renta',
      'servicios_publicos',
      'transporte',
      'sistema_software',
      'material_didactico',
      'mantenimiento',
      'marketing',
      'comunicacion',
      'profesional',
      'impuestos',
      'otros'
    )),
  /** Sub-categoría libre (ej. 'agua', 'luz', 'gasolina', 'hosting'). */
  subcategory         text,
  description         text,
  amount_usd          numeric(10,2) NOT NULL CHECK (amount_usd >= 0),
  /** Fecha en que se incurrió o pagó el gasto. */
  expense_date        date NOT NULL,
  payment_method      text,            -- 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'
  provider            text,            -- a quién se le pagó (CAESS, ANDA, etc.)
  invoice_reference   text,            -- nº de factura/recibo

  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid REFERENCES users(id)
);

COMMENT ON TABLE general_expenses IS 'Gastos operativos del centro (no incluye planillas, que tienen su propia tabla).';

CREATE INDEX IF NOT EXISTS general_expenses_date_idx
  ON general_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS general_expenses_category_idx
  ON general_expenses (category, expense_date DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_general_expenses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS general_expenses_updated_at ON general_expenses;
CREATE TRIGGER general_expenses_updated_at
  BEFORE UPDATE ON general_expenses
  FOR EACH ROW EXECUTE FUNCTION trg_general_expenses_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — solo admin / directora / contable
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE general_expenses ENABLE ROW LEVEL SECURITY;

-- current_user_role() ya existe (creada en 0117_payroll.sql)

DROP POLICY IF EXISTS general_expenses_select ON general_expenses;
CREATE POLICY general_expenses_select ON general_expenses
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_insert ON general_expenses;
CREATE POLICY general_expenses_insert ON general_expenses
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_update ON general_expenses;
CREATE POLICY general_expenses_update ON general_expenses
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_delete ON general_expenses;
CREATE POLICY general_expenses_delete ON general_expenses
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));
