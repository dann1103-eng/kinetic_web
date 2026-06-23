-- =============================================================================
-- 0151 — Vincular cita a grupo de programa matutino
-- =============================================================================
-- Los programas matutinos vuelven a generar CITAS por niño (event_type=
-- 'programa_matutino'), pero ahora ligadas al grupo al que pertenece el niño.
-- program_group_id permite agrupar las citas matutinas del grupo (lista de
-- recepción, etiqueta en agenda) y limpiar/regenerar por ciclo.
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS program_group_id uuid
    REFERENCES public.program_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_program_group_idx
  ON public.appointments (program_group_id)
  WHERE program_group_id IS NOT NULL;

-- ── Fin de migración 0151 ────────────────────────────────────────────────────
