-- 0109_treatment_plan_discounts.sql
-- Descuentos en treatment_plans y monthly_session_cycles.
-- discount_kind: 'none' | 'percent' | 'fixed'
-- discount_value: para 'percent' es 0-100, para 'fixed' es monto USD.

-- =============================================================================
-- 1. treatment_plans
-- =============================================================================
alter table public.treatment_plans
  add column if not exists discount_kind text default 'none',
  add column if not exists discount_value numeric(10, 2) default 0,
  add column if not exists discount_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_discount_kind_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_discount_kind_check
      check (discount_kind in ('none', 'percent', 'fixed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_discount_value_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

-- =============================================================================
-- 2. monthly_session_cycles
-- =============================================================================
alter table public.monthly_session_cycles
  add column if not exists discount_kind text default 'none',
  add column if not exists discount_value numeric(10, 2) default 0,
  add column if not exists discount_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'monthly_cycles_discount_kind_check'
  ) then
    alter table public.monthly_session_cycles
      add constraint monthly_cycles_discount_kind_check
      check (discount_kind in ('none', 'percent', 'fixed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'monthly_cycles_discount_value_check'
  ) then
    alter table public.monthly_session_cycles
      add constraint monthly_cycles_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

-- =============================================================================
-- 3. Comentarios
-- =============================================================================
comment on column public.treatment_plans.discount_kind is
  'Tipo de descuento aplicado al subtotal mensual: none, percent (0-100), o fixed (monto USD).';
comment on column public.treatment_plans.discount_value is
  'Magnitud del descuento. Si kind=percent, es porcentaje 0-100. Si kind=fixed, es USD.';
comment on column public.monthly_session_cycles.discount_kind is
  'Snapshot del descuento aplicado al ciclo. Default desde el treatment_plan pero editable por ciclo.';
