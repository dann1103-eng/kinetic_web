-- Menciones @ en comentarios de lista de espera (0165).
-- Paralela a requirement_mentions (0041) y review_comment_mentions (0047):
-- cada fila es una mención específica de un usuario dentro de un comentario
-- de una entrada de waitlist. El notif feed la expone como `kind: 'mention'`
-- con `mention_source: 'waitlist'`.

create table if not exists public.waitlist_comment_mentions (
  id                    uuid primary key default gen_random_uuid(),
  comment_id            uuid not null references public.waitlist_entry_comments(id) on delete cascade,
  entry_id              uuid not null references public.waitlist_entries(id) on delete cascade,
  mentioned_user_id     uuid not null references public.users(id) on delete cascade,
  mentioned_by_user_id  uuid references public.users(id) on delete set null,
  read_at               timestamptz,
  created_at            timestamptz not null default now(),
  unique (comment_id, mentioned_user_id)
);

create index if not exists waitlist_comment_mentions_user_unread_idx
  on public.waitlist_comment_mentions (mentioned_user_id, created_at desc)
  where read_at is null;

create index if not exists waitlist_comment_mentions_comment_idx
  on public.waitlist_comment_mentions (comment_id);

alter table public.waitlist_comment_mentions enable row level security;

-- SELECT: usuario mencionado, quien menciona, o admin
create policy "waitlist_mentions_select"
  on public.waitlist_comment_mentions for select
  using (
    mentioned_user_id = auth.uid()
    or mentioned_by_user_id = auth.uid()
    or public.is_admin()
  );

-- Sin policy de INSERT: se escribe exclusivamente con admin client desde
-- addWaitlistComment (bypassa RLS), igual que requirement_mentions.

-- UPDATE: el propio usuario mencionado (para marcar como leída)
create policy "waitlist_mentions_update_own"
  on public.waitlist_comment_mentions for update
  using (mentioned_user_id = auth.uid());

-- GRANTs requeridos para PostgREST
grant all on public.waitlist_comment_mentions to anon, authenticated, service_role;

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.waitlist_comment_mentions';
  end if;
exception when duplicate_object then
  null;
end$$;

notify pgrst, 'reload schema';
