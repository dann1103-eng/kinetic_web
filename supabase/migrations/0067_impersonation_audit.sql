-- 0067_impersonation_audit.sql
-- Tabla de auditoría para el modo espectador del admin.
-- Cada start/stop de impersonación registra una fila aquí. La cookie
-- httpOnly fm_impersonate_user_id es la fuente de verdad — esta tabla
-- solo provee trazabilidad para forensics.

create table if not exists public.impersonation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists impersonation_logs_admin_idx
  on public.impersonation_logs(admin_user_id, started_at desc);
create index if not exists impersonation_logs_target_idx
  on public.impersonation_logs(target_user_id, started_at desc);

alter table public.impersonation_logs enable row level security;

-- Lectura: solo admins pueden ver el log completo.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'impersonation_logs'
      and policyname = 'impersonation_logs_admin_read'
  ) then
    create policy impersonation_logs_admin_read on public.impersonation_logs
      for select using (
        exists (
          select 1 from public.users u
          where u.id = auth.uid() and u.role = 'admin'
        )
      );
  end if;
end $$;

-- INSERT/UPDATE solo via service role (admin client en server actions).
-- No se exponen políticas para esas operaciones.
