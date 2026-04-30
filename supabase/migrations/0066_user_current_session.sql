-- 0066_user_current_session.sql
-- Single-session-per-user enforcement.
-- Adds users.current_session_id (uuid). When a device logs in, it claims a new
-- UUID and writes it here. Other devices subscribe via realtime and notice the
-- mismatch with their locally-stored session id → they get force-logged-out.

alter table public.users
  add column if not exists current_session_id uuid;

-- Permitir al propio usuario actualizar su current_session_id (para llamar
-- claimSession() sin admin client). Solo se permite UPDATE de su propia fila.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_self_update_session'
  ) then
    create policy users_self_update_session on public.users
      for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Asegurar que la tabla users esté en la publicación supabase_realtime para
-- que SessionSentinel pueda detectar el kick vía postgres_changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'users'
    ) then
      execute 'alter publication supabase_realtime add table public.users';
    end if;
  end if;
end $$;
