-- Migración 0129 — Tipos de evento de citas (refactor)
--
-- Cambios:
--   ✗ Quita 'entrevista_directora' (los registros existentes se migran a
--     'entrevista_conocimiento' que es el reemplazo más cercano)
--   ✓ Agrega 'entrevista_antecedentes' (primera reunión con padres antes del niño)
--   ✓ Agrega 'entrevista_conocimiento' (entrevista de evaluación inicial)
--   ✓ Agrega 'entrega_avances' (devolución de informes a la familia)
--   ✓ Agrega 'otro' (catch-all con label personalizado)
--   ✓ Nueva columna `custom_event_label` (text) — solo se usa cuando
--     event_type='otro' para guardar el nombre libre que ponga el usuario.

-- ── 1. Agregar la columna nueva ─────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS custom_event_label text;

COMMENT ON COLUMN public.appointments.custom_event_label IS
  'Solo aplica cuando event_type=otro. Texto libre que aparece como etiqueta del evento en calendario/listados.';

-- ── 2. Migrar 'entrevista_directora' → 'entrevista_conocimiento' ────────
UPDATE public.appointments
SET event_type = 'entrevista_conocimiento'
WHERE event_type = 'entrevista_directora';

-- ── 3. Drop + recreate del CHECK constraint con la lista nueva ─────────
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_event_type_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_event_type_check CHECK (event_type IN (
    'terapia',
    'entrevista_antecedentes',
    'entrevista_conocimiento',
    'reunion_padres',
    'reunion_colegio',
    'evaluacion',
    'entrega_avances',
    'programa_matutino',
    'otro'
  ));

-- ── 4. Validación cruzada: si event_type='otro', custom_event_label es requerido
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_custom_label_required_for_otro;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_custom_label_required_for_otro CHECK (
    event_type <> 'otro'
    OR (custom_event_label IS NOT NULL AND length(trim(custom_event_label)) > 0)
  );
