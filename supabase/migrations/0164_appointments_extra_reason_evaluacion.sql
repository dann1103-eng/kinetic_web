-- =============================================================================
-- 0164 — Permitir extra_reason='evaluacion' en appointments
-- =============================================================================
-- PROBLEMA (producción): al agendar una EVALUACIÓN el sistema tira
--   new row for relation "appointments" violates check constraint
--   "appointments_extra_session_check"  (o "appointments_extra_reason_check")
--
-- Causa: las evaluaciones agendables (0156) se contabilizan como extraordinarias
-- para la planilla de servicios profesionales, así que createAppointment inserta
--   is_extra = true, extra_reason = 'evaluacion'
-- y el tipo TS `ExtraReason` ya incluye 'evaluacion'. PERO el CHECK que nació en
-- 0142 solo permite ('hora_extra','sabado','cobertura'). Nunca se aplicó una
-- migración que ampliara el dominio → el insert lo rechaza.
--
-- FIX (idempotente): dropear el CHECK con sus DOS nombres posibles (el auto de
-- 0142 `appointments_extra_reason_check` y el que pueda haber quedado manual en
-- producción `appointments_extra_session_check`) y re-crear uno solo, canónico,
-- que incluya 'evaluacion'.
-- =============================================================================

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_extra_reason_check;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_extra_session_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_extra_reason_check
  CHECK (
    extra_reason IS NULL
    OR extra_reason IN ('hora_extra', 'sabado', 'cobertura', 'evaluacion')
  );

COMMENT ON COLUMN public.appointments.extra_reason IS
  'Motivo cuando is_extra = true: hora_extra | sabado | cobertura | evaluacion. '
  'Suma a la planilla de servicios profesionales.';

-- ── Fin de migración 0164 ────────────────────────────────────────────────────
