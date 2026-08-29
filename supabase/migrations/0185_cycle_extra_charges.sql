-- 0185 — Líneas libres de cobro en el ciclo mensual
--
-- El monto de un ciclo y las líneas de su factura salían las dos de
-- `treatment_plan_snapshot.therapies_json`, así que solo se podía cobrar lo que
-- fuera una terapia. Un concepto suelto (materiales, una evaluación puntual, un
-- cargo acordado) no tenía dónde vivir: meterlo como "terapia" lo habría hecho
-- aparecer en "días y fechas por terapia" del detalle y lo habría metido en el
-- emparejado con la agenda, que cuenta citas.
--
-- Forma de cada línea:
--   [{ "description": "Materiales", "quantity": 1, "unit_price": 15.00 }]
--
-- Solo se agregan desde la previsualización del detalle de pago, que recalcula
-- `payment_amount_usd` en TS. Las RPC de SQL que calculan el monto al GENERAR el
-- ciclo no conocen estas líneas, y no hace falta que lo hagan: al generar todavía
-- no existen.

alter table public.monthly_session_cycles
  add column if not exists extra_charges_json jsonb not null default '[]'::jsonb;

comment on column public.monthly_session_cycles.extra_charges_json is
  'Líneas de cobro que no son terapias: [{description, quantity, unit_price}]. Se suman al monto del ciclo y a la factura.';
