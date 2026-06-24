-- =============================================================================
-- 0156 — Evaluaciones agendables con nombre libre + tipo del catálogo
-- =============================================================================
-- Las evaluaciones (event_type='evaluacion') usualmente se le hacen a personas
-- NUEVAS, no a un niño/a ya registrado. Por eso:
--   - child_id pasa a NULLABLE (la evaluación puede no tener niño en el sistema).
--   - external_child_name: nombre libre de referencia (quién recibe la evaluación).
--   - service_code: código del ítem de service_catalog elegido (tipo de evaluación),
--     para poder calcular el pago a la persona por su cost_usd.
--
-- RLS de appointments NO cambia: is_agency_user() ya permite SELECT a todo el
-- staff y la policy por therapist_id sigue aplicando. is_family_of_child(NULL)
-- simplemente da false (las evaluaciones no son de una familia del portal).
-- =============================================================================

-- child_id deja de ser obligatorio (la FK on delete cascade sigue intacta).
alter table public.appointments
  alter column child_id drop not null;

-- Nombre libre de la persona evaluada (solo para evaluaciones sin niño registrado).
alter table public.appointments
  add column if not exists external_child_name text;

-- Código del catálogo de servicios elegido (tipo de evaluación → pago por cost_usd).
alter table public.appointments
  add column if not exists service_code text;

-- ── Fin de migración 0156 ───────────────────────────────────────────────────
