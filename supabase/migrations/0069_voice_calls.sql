-- ============================================================
-- FM CRM — Migration 0069: Llamadas de voz/video estilo Discord
-- ============================================================
-- Agrega:
--   1) Tipo 'voice_channel' a conversations.type (canales de voz persistentes).
--   2) Tabla call_sessions: una fila por llamada (DM o canal).
--   3) Tabla call_participants: histórico de quién entró/salió de cada sesión.
--   4) RLS: solo miembros de la conversación ven/insertan/actualizan.
--   5) Realtime: call_sessions en publicación supabase_realtime.
--
-- El media de WebRTC NO pasa por Supabase — solo metadata. La señalización
-- "incoming call" viaja por Supabase Realtime broadcast, no por estas tablas.
-- ============================================================

-- ── 1) Extender conversations.type para canales de voz ──────────
do $$
declare
  cname text;
begin
  -- Drop el check constraint actual (nombre auto-generado por Postgres).
  -- Buscamos el check sobre la columna type específicamente.
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'conversations'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%dm%channel%'
  limit 1;

  if cname is not null then
    execute format('alter table public.conversations drop constraint %I', cname);
  end if;
end$$;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('dm','channel','voice_channel'));

-- Los voice_channel también requieren name (igual que channel)
alter table public.conversations
  drop constraint if exists conversations_channel_requires_name;

alter table public.conversations
  add constraint conversations_channel_requires_name
  check (
    type = 'dm'
    or (name is not null and char_length(trim(name)) > 0)
  );

-- ── 2) call_sessions ────────────────────────────────────────────
create table if not exists public.call_sessions (
  id                  uuid        primary key default gen_random_uuid(),
  conversation_id     uuid        not null references public.conversations(id) on delete cascade,
  started_by          uuid        not null references public.users(id) on delete cascade,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  livekit_room_name   text        not null unique,
  modality            text        not null default 'voice'
                                  check (modality in ('voice','video','screen'))
);

create index if not exists call_sessions_conversation_active_idx
  on public.call_sessions (conversation_id)
  where ended_at is null;

create index if not exists call_sessions_started_at_idx
  on public.call_sessions (started_at desc);

-- ── 3) call_participants ────────────────────────────────────────
create table if not exists public.call_participants (
  session_id    uuid        not null references public.call_sessions(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  primary key (session_id, user_id, joined_at)
);

create index if not exists call_participants_user_idx
  on public.call_participants (user_id);

-- ── 4) RLS ──────────────────────────────────────────────────────
alter table public.call_sessions enable row level security;
alter table public.call_participants enable row level security;

drop policy if exists call_sessions_select on public.call_sessions;
create policy call_sessions_select on public.call_sessions
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_sessions_insert on public.call_sessions;
create policy call_sessions_insert on public.call_sessions
  for insert with check (
    started_by = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_sessions_update on public.call_sessions;
create policy call_sessions_update on public.call_sessions
  for update using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_select on public.call_participants;
create policy call_participants_select on public.call_participants
  for select using (
    exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_insert on public.call_participants;
create policy call_participants_insert on public.call_participants
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_update on public.call_participants;
create policy call_participants_update on public.call_participants
  for update using (
    user_id = auth.uid()
    or exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

-- ── 5) Realtime ─────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'call_sessions'
    ) then
      execute 'alter publication supabase_realtime add table public.call_sessions';
    end if;
  end if;
end$$;

alter table public.call_sessions replica identity full;

notify pgrst, 'reload schema';
