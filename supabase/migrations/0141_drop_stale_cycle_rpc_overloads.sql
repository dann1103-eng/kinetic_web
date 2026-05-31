-- =============================================================================
-- 0141 — Eliminar sobrecargas obsoletas de las RPC del ciclo
-- =============================================================================
-- 'create or replace function' con una firma NUEVA (distinto # de args) crea
-- una SOBRECARGA en vez de reemplazar la anterior. Al ir agregando parámetros
-- (p_due_date en 0136, p_rollover_* en 0139, p_rollover_sessions en compute)
-- quedaron varias versiones coexistiendo, y las llamadas resultan ambiguas:
--   "Could not choose the best candidate function ..."
--
-- Dejamos SOLO la versión más reciente de cada función:
--   • compute_monthly_appointment_candidates(uuid, date, jsonb)         (0139)
--   • confirm_monthly_payment_and_generate(uuid, date, numeric, text,
--       text, timestamptz, text, jsonb, date, jsonb, text, numeric)     (0139)
-- =============================================================================

-- compute: borrar la versión de 2 args (0137 y anteriores).
DROP FUNCTION IF EXISTS public.compute_monthly_appointment_candidates(uuid, date);

-- confirm: borrar la de 8 args (0106/0134) y la de 9 args (0136).
DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text, jsonb
);
DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text, jsonb, date
);
