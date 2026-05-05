-- 0075_quotes_optional_client.sql
-- Permite generar cotizaciones a prospectos (sin cliente creado en BD).
-- client_id pasa a ser nullable; los datos del prospecto se guardan en
-- client_snapshot_json (campo ya existente desde 0048_billing_module).

begin;

alter table public.quotes
  alter column client_id drop not null;

-- La FK 'on delete restrict' tolera null sin cambios. La policy del cliente
-- (Billing users can view own quotes en 0073) ya ignora filas con client_id null.

commit;
