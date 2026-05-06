-- Añade el snapshot de términos y condiciones a las facturas.
-- Las cotizaciones ya tenían esta columna (migración 0048).
alter table public.invoices
  add column if not exists terms_snapshot_json jsonb;
