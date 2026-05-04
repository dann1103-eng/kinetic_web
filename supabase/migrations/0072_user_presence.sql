-- ============================================================
-- FM CRM — Migration 0072: presence manual de usuarios
-- ============================================================
-- Tabla separada de `users` (no metemos toda la tabla de users en realtime)
-- con el estado manual del usuario. El estado "en videollamada" NO se guarda
-- aquí — se deriva en el cliente cruzando call_participants y call_sessions
-- activas, y override visualmente al estado manual.
--
-- Estados:
--   online    — usuario disponible (default)
--   away      — usuario ausente / no perturbar
--   almuerzo  — usuario en almuerzo
--
-- Quién puede ver: cualquier usuario autenticado (es información pública
-- entre el equipo, no sensible).
-- Quién puede actualizar: solo el dueño (user_id = auth.uid()).
-- ============================================================

create table if not exists public.user_presence (
  user_id     uuid primary key references public.users(id) on delete cascade,
  status      text not null default 'online'
              check (status in ('online','away','almuerzo')),
  updated_at  timestamptz not null default now()
);

create index if not exists user_presence_status_idx
  on public.user_presence (status);

-- Trigger para mantener updated_at fresco automáticamente
create or replace function public.touch_user_presence_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_presence_touch_updated_at on public.user_presence;
create trigger user_presence_touch_updated_at
  before update on public.user_presence
  for each row execute function public.touch_user_presence_updated_at();

-- RLS
alter table public.user_presence enable row level security;

drop policy if exists user_presence_select on public.user_presence;
create policy user_presence_select on public.user_presence
  for select using (auth.uid() is not null);

drop policy if exists user_presence_insert on public.user_presence;
create policy user_presence_insert on public.user_presence
  for insert with check (user_id = auth.uid());

drop policy if exists user_presence_update on public.user_presence;
create policy user_presence_update on public.user_presence
  for update using (user_id = auth.uid());

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'user_presence'
    ) then
      execute 'alter publication supabase_realtime add table public.user_presence';
    end if;
  end if;
end$$;

alter table public.user_presence replica identity full;

-- También agregamos call_participants a realtime — necesario para detectar
-- "en videollamada" en vivo en el cliente (cuando alguien entra/sale de un
-- room, los demás ven actualizar el indicador).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'call_participants'
    ) then
      execute 'alter publication supabase_realtime add table public.call_participants';
    end if;
  end if;
end$$;

alter table public.call_participants replica identity full;

notify pgrst, 'reload schema';
