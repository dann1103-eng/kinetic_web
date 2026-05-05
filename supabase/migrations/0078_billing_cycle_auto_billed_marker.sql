-- 0078_billing_cycle_auto_billed_marker.sql
-- Evita que el cron auto-facture si ya hay factura (manual o automática) cubriendo
-- el período del scheduled cycle.

begin;

alter table public.billing_cycles
  add column if not exists auto_billed_at timestamptz;

create index if not exists billing_cycles_auto_billed_at_idx
  on public.billing_cycles(auto_billed_at)
  where auto_billed_at is not null;

commit;
