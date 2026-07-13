-- =============================================================================
-- 0178 — Desacople F4: columna de ajuste RECIBIDO (arrastre entrante)
-- =============================================================================
-- 0177 agregó billing_adjustment_usd (el ajuste que un ciclo PAGADO GENERA
-- cuando el plan cambia tras el pago) + billing_adjustment_carried_at (cuándo
-- se cobró en una factura posterior). Falta el espejo de surcharge_carried_in_usd:
-- el monto de ajuste(s) RECIBIDO(s) en la factura de ESTE ciclo, para que al
-- regenerar la factura la línea de ajuste no se pierda (evita perder dinero).
-- =============================================================================

alter table public.monthly_session_cycles
  add column if not exists billing_adjustment_carried_in_usd numeric(12,2) not null default 0;

comment on column public.monthly_session_cycles.billing_adjustment_carried_in_usd is
  'Ajuste(s) de mensualidades anteriores (cambio de plan tras el pago) cobrados/acreditados en la factura de ESTE ciclo. Positivo=cargo, negativo=crédito. Mig 0178.';

notify pgrst, 'reload schema';
