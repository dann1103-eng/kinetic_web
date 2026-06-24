-- =============================================================================
-- 0153 — Eliminar overload viejo de 7 args de confirm_monthly_payment_and_generate
-- =============================================================================
-- La función tenía dos overloads:
--   1) 7 args (original, sin payment_status, rollover, grupos)
--   2) 14 args (actual, con todos los campos modernos)
--
-- La coexistencia de ambos causaba confusión en la resolución de overloads y
-- permitía que el overload viejo se ejecutara en ciertos escenarios, generando
-- ciclos con estado inconsistente (payment_status DEFAULT 'paid' en lugar de
-- 'pending', sin due_date, etc.).
--
-- Aplicado manualmente en producción el 2026-06-23 via Supabase CLI.
-- Este archivo documenta el cambio para trazabilidad.
-- =============================================================================

DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text
);

-- ── Fin de migración 0153 ────────────────────────────────────────────────────
