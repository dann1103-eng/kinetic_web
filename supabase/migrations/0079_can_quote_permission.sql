-- Permiso especial para cotizar sin acceso completo a facturación.
-- Se asigna manualmente a usuarios específicos; no hay UI de gestión.
alter table public.users
  add column if not exists can_quote boolean not null default false;
