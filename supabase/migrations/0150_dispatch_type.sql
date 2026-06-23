-- supabase/migrations/0150_dispatch_type.sql
-- =============================================================================
-- 0150 — Tres tipos de despacho: internal | to_reception | to_parent
-- =============================================================================
-- dispatch_type: cómo fue despachado el niño (null = legacy sin tipo).
-- handed_to_reception_at: cuando la terapista entregó el niño a recepción;
--   el timer de gracia corre desde aquí (no desde completed_at).
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS dispatch_type text
    CHECK (dispatch_type IN ('internal', 'to_reception', 'to_parent')),
  ADD COLUMN IF NOT EXISTS handed_to_reception_at timestamptz;

-- Índice para la cola de recepción.
CREATE INDEX IF NOT EXISTS appointments_reception_queue_idx
  ON public.appointments (handed_to_reception_at)
  WHERE dispatch_type = 'to_reception'
    AND dispatched_at IS NULL
    AND handed_to_reception_at IS NOT NULL;

-- ── Fin de migración 0150 ──────────────────────────────────────────────────
