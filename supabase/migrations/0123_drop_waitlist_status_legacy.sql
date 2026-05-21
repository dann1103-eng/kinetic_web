-- Migración 0123 — Limpieza legacy de waitlist
--
-- El status enum era del modelo viejo de 4 estados antes de mig 0121.
-- Ahora cada waitlist_entry vive en una sub-fase del catálogo (current_phase_code).
-- Eliminar:
--   - waitlist_entries.status (columna)
--   - enum waitlist_status (tipo)
--   - trigger children_sync_legacy_phase + función sync_legacy_phase_fields
--     (mantenía intake_phase/treatment_status legacy en sync — ya no aplica para waitlist;
--     se conserva el mapeo en children porque otros módulos aún lo leen, fase 2)

ALTER TABLE waitlist_entries DROP COLUMN IF EXISTS status CASCADE;

-- El enum puede dropearse cuando ya nadie lo referencia.
DROP TYPE IF EXISTS waitlist_status CASCADE;
