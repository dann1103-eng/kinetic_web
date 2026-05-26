-- Migración 0128 — Campos adicionales del registro de niños:
--   • Lugar de trabajo y teléfono de oficina de mamá y papá (importante para
--     llamadas en horario laboral cuando no contestan el celular)
--   • Pediatra del niño + su teléfono (importante para emergencias)
--   • Consentimiento de publicación de fotos en redes / material institucional

-- ── families ──────────────────────────────────────────────────────────────
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS mom_workplace      text,
  ADD COLUMN IF NOT EXISTS mom_work_phone     text,
  ADD COLUMN IF NOT EXISTS dad_workplace      text,
  ADD COLUMN IF NOT EXISTS dad_work_phone     text,
  ADD COLUMN IF NOT EXISTS pediatrician_name  text,
  ADD COLUMN IF NOT EXISTS pediatrician_phone text;

COMMENT ON COLUMN public.families.mom_workplace IS
  'Lugar de trabajo de la madre/contacto primario. Útil para escalación cuando no contesta el celular.';
COMMENT ON COLUMN public.families.dad_workplace IS
  'Lugar de trabajo del padre/contacto secundario.';
COMMENT ON COLUMN public.families.pediatrician_name IS
  'Médico pediatra/neurólogo del niño. Crítico para emergencias.';

-- ── children ──────────────────────────────────────────────────────────────
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS photo_consent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.children.photo_consent IS
  'Consentimiento firmado por la familia para usar fotos del niño en Facebook, afiches y material institucional.';
