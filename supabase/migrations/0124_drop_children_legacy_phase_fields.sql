-- Migración 0124 — Limpieza fase 2: drop intake_phase / treatment_status
--
-- Estos campos eran del modelo pre-pipeline. Ahora `current_phase_code`
-- (FK a intake_phase_catalog) cubre ambos roles: fase del intake +
-- estado del tratamiento.
--
-- Borrar:
--   - Trigger children_sync_legacy_phase + función sync_legacy_phase_fields
--   - children.intake_phase + intake_phase_changed_at
--   - children.treatment_status + treatment_status_changed_at + treatment_status_notes
--   - índices asociados
--
-- Conservar (porque modelan otra dimensión):
--   - children.enrolled_program (programa matutino — blue_kids / learning_kids / aula_educativa)
--   - children.enrollment_started_at / enrollment_ended_at

-- ── 1. Drop trigger + función de sync legacy ────────────────────────
DROP TRIGGER IF EXISTS children_sync_legacy_phase ON children;
DROP FUNCTION IF EXISTS sync_legacy_phase_fields() CASCADE;

-- ── 2. Drop columnas legacy ─────────────────────────────────────────
DROP INDEX IF EXISTS children_intake_phase_idx;
DROP INDEX IF EXISTS children_treatment_status_idx;

ALTER TABLE children
  DROP COLUMN IF EXISTS intake_phase CASCADE,
  DROP COLUMN IF EXISTS intake_phase_changed_at CASCADE,
  DROP COLUMN IF EXISTS treatment_status CASCADE,
  DROP COLUMN IF EXISTS treatment_status_changed_at CASCADE,
  DROP COLUMN IF EXISTS treatment_status_notes CASCADE;

-- ── 3. Agregar audit timestamp + notas en la columna nueva ──────────
-- (Lo que antes vivía en intake_phase_changed_at + treatment_status_notes
-- ahora se consolida; la fuente de verdad para historial es child_phase_history.)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS current_phase_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_phase_notes text;
