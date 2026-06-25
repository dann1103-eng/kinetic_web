-- 0161_users_bank_fields.sql
-- Datos bancarios por empleado para el documento de transferencias (planilla de
-- números de cuenta). El DUI ya existe (users.dui); se agregan banco, tipo y
-- número de cuenta, y NIT.
alter table public.users
  add column if not exists bank_name text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists nit text;
