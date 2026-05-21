-- Migración 0119 — Adjuntos unificados por niño (cross-entity)
--
-- Tabla única `child_attachments` que reemplaza el modelo "1 archivo por
-- session_report" y "1 archivo por progress_report". Cada fila representa un
-- archivo subido al bucket `reports-files` y puede estar opcionalmente
-- vinculada a una cita, un session_report o un progress_report (one-of).
--
-- Usos:
--   - Notas/tareas post-sesión con varios adjuntos por cita visibles a la
--     familia desde /portal/agenda.
--   - Documentos adicionales al cierre de un informe cuatrimestral.
--   - Biblioteca unificada de descargas en /portal/descargas.

CREATE TABLE IF NOT EXISTS child_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,

  -- Vinculación opcional (idealmente solo uno seteado por fila — no se fuerza
  -- vía CHECK para permitir flexibilidad futura, pero la UI sube con uno solo).
  appointment_id      uuid REFERENCES appointments(id) ON DELETE CASCADE,
  session_report_id   uuid REFERENCES session_reports(id) ON DELETE CASCADE,
  progress_report_id  uuid REFERENCES progress_reports(id) ON DELETE CASCADE,

  -- Archivo en bucket reports-files (path completo)
  file_url            text NOT NULL,
  file_name           text NOT NULL,
  file_size_bytes     integer,
  file_mime_type      text,

  -- Meta visibles a la familia
  title               text,
  description         text,
  kind                text NOT NULL DEFAULT 'otro'
    CHECK (kind IN ('tarea', 'evaluacion', 'imagen', 'informe_adicional', 'otro')),

  -- Visibilidad / audit
  visible_to_family   boolean NOT NULL DEFAULT true,
  uploaded_by_user_id uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_attachments IS
  'Adjuntos unificados por niño: tareas, imágenes, evaluaciones, documentos extra. Visible a la familia si visible_to_family=true.';

CREATE INDEX IF NOT EXISTS child_attachments_child_idx
  ON child_attachments (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS child_attachments_appointment_idx
  ON child_attachments (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_attachments_session_report_idx
  ON child_attachments (session_report_id)
  WHERE session_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_attachments_progress_report_idx
  ON child_attachments (progress_report_id)
  WHERE progress_report_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_child_attachments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_attachments_updated_at ON child_attachments;
CREATE TRIGGER child_attachments_updated_at
  BEFORE UPDATE ON child_attachments
  FOR EACH ROW EXECUTE FUNCTION trg_child_attachments_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE child_attachments ENABLE ROW LEVEL SECURITY;

-- current_user_role() ya existe (creada en 0117_payroll.sql)

-- Staff (admin / directora / coordinadora_* / terapista / maestra / recepcion /
-- contable / supervisor) puede leer todos los adjuntos.
DROP POLICY IF EXISTS child_attachments_select_staff ON child_attachments;
CREATE POLICY child_attachments_select_staff ON child_attachments
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion', 'contable'
    )
  );

-- Family ve solo adjuntos visibles de sus propios niños.
DROP POLICY IF EXISTS child_attachments_select_family ON child_attachments;
CREATE POLICY child_attachments_select_family ON child_attachments
  FOR SELECT TO authenticated
  USING (
    visible_to_family = true
    AND EXISTS (
      SELECT 1
      FROM children c
      JOIN family_users fu ON fu.family_id = c.family_id
      WHERE c.id = child_attachments.child_id
        AND fu.user_id = auth.uid()
    )
  );

-- Staff con permiso operativo puede insertar.
DROP POLICY IF EXISTS child_attachments_insert ON child_attachments;
CREATE POLICY child_attachments_insert ON child_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  );

-- Staff puede actualizar (toggle visible_to_family, editar título/descripción).
DROP POLICY IF EXISTS child_attachments_update ON child_attachments;
CREATE POLICY child_attachments_update ON child_attachments
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  )
  WITH CHECK (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  );

-- Borrado: solo el autor o admin/directora.
DROP POLICY IF EXISTS child_attachments_delete ON child_attachments;
CREATE POLICY child_attachments_delete ON child_attachments
  FOR DELETE TO authenticated
  USING (
    current_user_role() IN ('admin', 'directora')
    OR uploaded_by_user_id = auth.uid()
  );
