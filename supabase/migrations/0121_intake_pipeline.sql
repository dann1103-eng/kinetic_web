-- Migración 0121 — Pipeline completo de admisión Kinetic
--
-- Crea:
--   1. intake_phase_catalog (17 fases sembradas)
--   2. waitlist_entries.current_phase_code (+ backfill)
--   3. children.current_phase_code (+ backfill)
--   4. trigger sync_legacy_phase_fields (back-compat con intake_phase + treatment_status)
--   5. child_phase_history (audit log de transiciones)
--   6. child_discharge_records (alta / retiro firmable)
--   7. dashboard_alerts (banner notificaciones)
--
-- Reusa current_user_role() (creada en 0117_payroll.sql) para RLS.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE FASES
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intake_phase_catalog (
  code                         text PRIMARY KEY,
  group_number                 smallint NOT NULL CHECK (group_number BETWEEN 1 AND 5),
  group_name                   text NOT NULL,
  sub_order                    smallint NOT NULL CHECK (sub_order >= 1),
  label                        text NOT NULL,
  description                  text,
  is_optional                  boolean NOT NULL DEFAULT false,
  is_waitlist_visible          boolean NOT NULL DEFAULT true,
  is_terminal                  boolean NOT NULL DEFAULT false,
  creates_child                boolean NOT NULL DEFAULT false,
  cancels_future_appointments  boolean NOT NULL DEFAULT false,
  active                       boolean NOT NULL DEFAULT true,
  sort_order                   integer NOT NULL,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE intake_phase_catalog IS
  'Catálogo editable de las 17 sub-fases del pipeline de admisión Kinetic (5 grupos). Referenciado por waitlist_entries.current_phase_code y children.current_phase_code.';

CREATE UNIQUE INDEX IF NOT EXISTS intake_phase_catalog_order_idx
  ON intake_phase_catalog (group_number, sub_order);

-- Seed (idempotente)
INSERT INTO intake_phase_catalog (
  code, group_number, group_name, sub_order, label, description,
  is_optional, is_waitlist_visible, is_terminal,
  creates_child, cancels_future_appointments, sort_order
) VALUES
  ('1_1_contacto_inicial',       1, 'Primer contacto',        1, 'Contacto Inicial',
    'Familia realizó consulta por WhatsApp, llamada, redes o referencia.', false, true,  false, false, false, 11),
  ('1_2_informacion_enviada',    1, 'Primer contacto',        2, 'Información Enviada',
    'Se compartió información institucional, servicios, costos o proceso.', false, true,  false, false, false, 12),
  ('1_3_entrevista_agendada',    1, 'Primer contacto',        3, 'Entrevista Agendada',
    'La familia confirmó cita de conocimiento.', false, true,  false, false, false, 13),

  ('2_1_entrevista_conocimiento', 2, 'Proceso de Admisión',   1, 'Entrevista de Conocimiento',
    'Primera reunión con padres/familia.', false, true,  false, false, false, 21),
  ('2_2_observacion_clinica',    2, 'Proceso de Admisión',    2, 'Observación Clínica',
    'Observación inicial del niño dentro del centro.', false, true,  false, false, false, 22),
  ('2_3_observacion_escolar',    2, 'Proceso de Admisión',    3, 'Observación Escolar',
    'Observación en colegio, kínder o entorno educativo.', true,  true,  false, false, false, 23),
  ('2_4_propuesta_evaluacion',   2, 'Proceso de Admisión',    4, 'Propuesta de Evaluación',
    'Se sugieren áreas a evaluar según hallazgos.', false, true,  false, false, false, 24),
  ('2_5_evaluacion_en_proceso',  2, 'Proceso de Admisión',    5, 'Evaluación en Proceso',
    'El niño está siendo evaluado.', false, true,  false, false, false, 25),
  ('2_6_levantamiento_informes', 2, 'Proceso de Admisión',    6, 'Levantamiento de Informes',
    'Profesionales redactando resultados e interpretación.', false, true,  false, false, false, 26),
  ('2_7_informes_entregados',    2, 'Proceso de Admisión',    7, 'Informes Entregados',
    'Se entregaron resultados y devolución a familia.', false, true,  false, false, false, 27),

  ('3_1_propuesta_terapeutica',  3, 'Inicio Terapéutico',     1, 'Propuesta Terapéutica',
    'Se recomienda plan de terapias y frecuencia.', false, true,  false, false, false, 31),
  ('3_2_inscripcion_activa',     3, 'Inicio Terapéutico',     2, 'Inscripción / Ingreso Activo',
    'Familia acepta proceso — se crea automáticamente el registro del niño.', false, true,  false, true,  false, 32),
  ('3_3_activo_en_terapias',     3, 'Inicio Terapéutico',     3, 'Activo en Terapias',
    'Recibiendo terapias regularmente.', false, false, false, false, false, 33),

  ('4_1_pausa_temporal',         4, 'Seguimiento',            1, 'Pausa Temporal',
    'Suspensión temporal por vacaciones, salud, economía, etc.', false, false, false, false, true,  41),
  ('4_2_seguimiento_pendiente',  4, 'Seguimiento',            2, 'Seguimiento Pendiente',
    'Familia no confirma continuidad pero sigue en contacto.', false, false, false, false, true,  42),

  ('5_1_alta_terapeutica',       5, 'Cierre',                 1, 'Alta Terapéutica',
    'Objetivos cumplidos; egreso positivo.', false, false, true,  false, true,  51),
  ('5_2_retirado',               5, 'Cierre',                 2, 'Retirado',
    'Finalización por decisión familiar, cambio de centro u otras razones.', false, false, true,  false, true,  52)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE intake_phase_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_phase_catalog_select ON intake_phase_catalog;
CREATE POLICY intake_phase_catalog_select ON intake_phase_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS intake_phase_catalog_modify ON intake_phase_catalog;
CREATE POLICY intake_phase_catalog_modify ON intake_phase_catalog
  FOR ALL TO authenticated
  USING (current_user_role() IN ('admin', 'directora'))
  WITH CHECK (current_user_role() IN ('admin', 'directora'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2. EXTENSIÓN waitlist_entries
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS current_phase_code text
    REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE;

UPDATE waitlist_entries SET current_phase_code = CASE
  WHEN status = 'waiting'   THEN '1_1_contacto_inicial'
  WHEN status = 'contacted' THEN '1_2_informacion_enviada'
  WHEN status = 'scheduled' THEN '3_2_inscripcion_activa'
  WHEN status = 'dropped'   THEN '5_2_retirado'
  ELSE '1_1_contacto_inicial'
END
WHERE current_phase_code IS NULL;

ALTER TABLE waitlist_entries
  ALTER COLUMN current_phase_code SET DEFAULT '1_1_contacto_inicial',
  ALTER COLUMN current_phase_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS waitlist_current_phase_idx
  ON waitlist_entries (current_phase_code);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. EXTENSIÓN children
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS current_phase_code text
    REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE;

UPDATE children SET current_phase_code = CASE
  WHEN treatment_status IN ('discharged_conditional','discharged_final') THEN '5_1_alta_terapeutica'
  WHEN treatment_status = 'dropped'                                     THEN '5_2_retirado'
  WHEN treatment_status = 'paused'                                      THEN '4_1_pausa_temporal'
  WHEN intake_phase = 'alta'                                            THEN '5_1_alta_terapeutica'
  WHEN intake_phase = 'en_terapias'                                     THEN '3_3_activo_en_terapias'
  WHEN intake_phase IN ('propuesta_plan_terapias',
                        'propuesta_economica_terapias')                 THEN '3_1_propuesta_terapeutica'
  WHEN intake_phase = 'informe_resultados'                              THEN '2_7_informes_entregados'
  WHEN intake_phase IN ('en_observacion_evaluacion',
                        'agenda_observacion')                           THEN '2_5_evaluacion_en_proceso'
  WHEN intake_phase IN ('propuesta_observacion_evaluacion',
                        'propuesta_economica_evaluacion')               THEN '2_4_propuesta_evaluacion'
  WHEN intake_phase = 'entrevista_directora'                            THEN '2_1_entrevista_conocimiento'
  WHEN intake_phase IN ('bateria_preguntas','solicitud_informacion')    THEN '1_1_contacto_inicial'
  ELSE '3_3_activo_en_terapias'
END
WHERE current_phase_code IS NULL;

ALTER TABLE children
  ALTER COLUMN current_phase_code SET DEFAULT '3_3_activo_en_terapias',
  ALTER COLUMN current_phase_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS children_current_phase_idx
  ON children (current_phase_code);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER de sincronización legacy (intake_phase + treatment_status)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_legacy_phase_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_phase_code IS DISTINCT FROM OLD.current_phase_code THEN
    NEW.intake_phase_changed_at := now();
    NEW.treatment_status_changed_at := now();

    CASE NEW.current_phase_code
      WHEN '1_1_contacto_inicial'        THEN NEW.intake_phase := 'solicitud_informacion';        NEW.treatment_status := 'active';
      WHEN '1_2_informacion_enviada'     THEN NEW.intake_phase := 'solicitud_informacion';        NEW.treatment_status := 'active';
      WHEN '1_3_entrevista_agendada'     THEN NEW.intake_phase := 'bateria_preguntas';            NEW.treatment_status := 'active';
      WHEN '2_1_entrevista_conocimiento' THEN NEW.intake_phase := 'entrevista_directora';         NEW.treatment_status := 'active';
      WHEN '2_2_observacion_clinica'     THEN NEW.intake_phase := 'agenda_observacion';           NEW.treatment_status := 'active';
      WHEN '2_3_observacion_escolar'     THEN NEW.intake_phase := 'agenda_observacion';           NEW.treatment_status := 'active';
      WHEN '2_4_propuesta_evaluacion'    THEN NEW.intake_phase := 'propuesta_observacion_evaluacion'; NEW.treatment_status := 'active';
      WHEN '2_5_evaluacion_en_proceso'   THEN NEW.intake_phase := 'en_observacion_evaluacion';    NEW.treatment_status := 'active';
      WHEN '2_6_levantamiento_informes'  THEN NEW.intake_phase := 'informe_resultados';           NEW.treatment_status := 'active';
      WHEN '2_7_informes_entregados'     THEN NEW.intake_phase := 'informe_resultados';           NEW.treatment_status := 'active';
      WHEN '3_1_propuesta_terapeutica'   THEN NEW.intake_phase := 'propuesta_plan_terapias';      NEW.treatment_status := 'active';
      WHEN '3_2_inscripcion_activa'      THEN NEW.intake_phase := 'propuesta_economica_terapias'; NEW.treatment_status := 'active';
      WHEN '3_3_activo_en_terapias'      THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'active';
      WHEN '4_1_pausa_temporal'          THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'paused';
      WHEN '4_2_seguimiento_pendiente'   THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'active';
      WHEN '5_1_alta_terapeutica'        THEN NEW.intake_phase := 'alta';                         NEW.treatment_status := 'discharged_final';
      WHEN '5_2_retirado'                THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'dropped';
      ELSE -- noop
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS children_sync_legacy_phase ON children;
CREATE TRIGGER children_sync_legacy_phase
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_phase_fields();

-- ──────────────────────────────────────────────────────────────────────────
-- 5. child_phase_history (audit log de transiciones)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS child_phase_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid REFERENCES children(id) ON DELETE CASCADE,
  waitlist_entry_id   uuid REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  from_phase_code     text REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE,
  to_phase_code       text NOT NULL REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE,
  notes               text,
  changed_by_user_id  uuid REFERENCES users(id),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_phase_history_target CHECK (
    (child_id IS NOT NULL AND waitlist_entry_id IS NULL)
    OR (child_id IS NULL AND waitlist_entry_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS child_phase_history_child_idx
  ON child_phase_history (child_id, changed_at DESC) WHERE child_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_phase_history_waitlist_idx
  ON child_phase_history (waitlist_entry_id, changed_at DESC) WHERE waitlist_entry_id IS NOT NULL;

ALTER TABLE child_phase_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_phase_history_select_staff ON child_phase_history;
CREATE POLICY child_phase_history_select_staff ON child_phase_history
  FOR SELECT TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion','contable'
  ));

DROP POLICY IF EXISTS child_phase_history_insert ON child_phase_history;
CREATE POLICY child_phase_history_insert ON child_phase_history
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion'
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- 6. child_discharge_records (alta / retiro firmable)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS child_discharge_records (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                  uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  discharge_type            text NOT NULL CHECK (discharge_type IN ('alta','retiro')),
  discharge_date            date NOT NULL DEFAULT CURRENT_DATE,

  child_snapshot_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  therapies_snapshot_json   jsonb NOT NULL DEFAULT '[]'::jsonb,

  total_sessions_attended   integer,
  attendance_rate_pct       numeric(5,2),
  total_replacements        integer,

  objectives_achieved       text,
  recommendations           text,
  follow_up_plan            text,
  discharge_reason          text,

  signed_by_therapist_id    uuid REFERENCES users(id),
  signed_by_therapist_name  text,
  signed_by_therapist_at    timestamptz,
  signed_by_directora_id    uuid REFERENCES users(id),
  signed_by_directora_name  text,
  signed_by_directora_at    timestamptz,

  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','signed','sent_to_family')),
  pdf_generated_at          timestamptz,
  created_by_user_id        uuid REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_discharge_records IS
  'Cartas de alta terapéutica y constancias de retiro. Snapshots de datos al momento del cierre. Firmadas por terapista y directora.';

CREATE INDEX IF NOT EXISTS child_discharge_records_child_idx
  ON child_discharge_records (child_id, discharge_date DESC);

CREATE OR REPLACE FUNCTION trg_child_discharge_records_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_discharge_records_updated_at ON child_discharge_records;
CREATE TRIGGER child_discharge_records_updated_at
  BEFORE UPDATE ON child_discharge_records
  FOR EACH ROW EXECUTE FUNCTION trg_child_discharge_records_updated_at();

ALTER TABLE child_discharge_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_discharge_records_select_staff ON child_discharge_records;
CREATE POLICY child_discharge_records_select_staff ON child_discharge_records
  FOR SELECT TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion','contable'
  ));

DROP POLICY IF EXISTS child_discharge_records_select_family ON child_discharge_records;
CREATE POLICY child_discharge_records_select_family ON child_discharge_records
  FOR SELECT TO authenticated
  USING (
    status = 'sent_to_family'
    AND EXISTS (
      SELECT 1 FROM children c
      JOIN family_users fu ON fu.family_id = c.family_id
      WHERE c.id = child_discharge_records.child_id
        AND fu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS child_discharge_records_insert ON child_discharge_records;
CREATE POLICY child_discharge_records_insert ON child_discharge_records
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS child_discharge_records_update ON child_discharge_records;
CREATE POLICY child_discharge_records_update ON child_discharge_records
  FOR UPDATE TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ))
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS child_discharge_records_delete ON child_discharge_records;
CREATE POLICY child_discharge_records_delete ON child_discharge_records
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','directora'));

-- ──────────────────────────────────────────────────────────────────────────
-- 7. dashboard_alerts (banner en dashboards)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type          text NOT NULL CHECK (alert_type IN ('discharge','dropout','phase_milestone')),
  child_id            uuid REFERENCES children(id) ON DELETE CASCADE,
  message             text NOT NULL,
  visible_to_roles    text[] NOT NULL DEFAULT ARRAY[
    'admin','directora','coordinadora_familias','coordinadora_terapias'
  ],
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid REFERENCES users(id)
);

COMMENT ON TABLE dashboard_alerts IS
  'Banners temporales (típicamente 7 días) en dashboards de coordinación. Para alta/retiro y otros milestones de fase.';

CREATE INDEX IF NOT EXISTS dashboard_alerts_active_idx
  ON dashboard_alerts (expires_at) WHERE expires_at > now();
CREATE INDEX IF NOT EXISTS dashboard_alerts_child_idx
  ON dashboard_alerts (child_id) WHERE child_id IS NOT NULL;

ALTER TABLE dashboard_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_alerts_select ON dashboard_alerts;
CREATE POLICY dashboard_alerts_select ON dashboard_alerts
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY(visible_to_roles));

DROP POLICY IF EXISTS dashboard_alerts_insert ON dashboard_alerts;
CREATE POLICY dashboard_alerts_insert ON dashboard_alerts
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS dashboard_alerts_delete ON dashboard_alerts;
CREATE POLICY dashboard_alerts_delete ON dashboard_alerts
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','directora'));
