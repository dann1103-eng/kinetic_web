-- Migración 0122 — Campos del formulario de prospectos (Google Form 2022 → CRM)
--
-- Recepción levantará el form de "Prospectos Kinetic" directamente desde el
-- CRM (reemplaza Google Forms). Estos son los campos que tiene el form vivo
-- y que faltan en `waitlist_entries`:
--
--   - Edad (texto libre — "5", "3 años 8 meses", etc.)
--   - Tiene evaluación previa (Sí/No)
--   - Cómo se enteró: Redes Sociales | Médico | Amigo o familiar |
--                     Reingreso | Colegio | Otro
--   - Interesado en (texto libre — qué quiere la familia)
--
-- "Estado del prospecto" del form se mapea a `current_phase_code` (mig 0121).
-- "Fecha" se mapea a `added_at`.
-- Nombre niño/a, padre/madre, correo, celular, diagnóstico ya existían.

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS child_age_text          text,
  ADD COLUMN IF NOT EXISTS has_previous_evaluation boolean,
  ADD COLUMN IF NOT EXISTS referral_channel        text
    CHECK (referral_channel IS NULL OR referral_channel IN (
      'redes_sociales', 'medico', 'amigo_familiar',
      'reingreso', 'colegio', 'otro'
    )),
  ADD COLUMN IF NOT EXISTS referral_channel_other  text,
  ADD COLUMN IF NOT EXISTS interest_text           text;

COMMENT ON COLUMN waitlist_entries.child_age_text IS
  'Edad del niño tal como la entró recepción (puede ser libre: "5", "3 años 8 meses").';
COMMENT ON COLUMN waitlist_entries.has_previous_evaluation IS
  'La familia trae evaluación previa de otro centro.';
COMMENT ON COLUMN waitlist_entries.referral_channel IS
  'Canal por el que se enteró del centro (cómo nos conoció).';
COMMENT ON COLUMN waitlist_entries.referral_channel_other IS
  'Texto libre cuando referral_channel = otro.';
COMMENT ON COLUMN waitlist_entries.interest_text IS
  'Qué programa o terapia le interesa, en palabras de recepción.';
