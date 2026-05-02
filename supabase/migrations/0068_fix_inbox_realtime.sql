-- 0068_fix_inbox_realtime.sql
-- Re-asegura que las tablas del inbox estén en supabase_realtime.
-- La migración 0050 original no tenía guard "if not exists", por lo que
-- si alguna tabla ya estaba en la publicación, la ejecución fallaba
-- silenciosamente y las demás tablas no se añadían.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.conversations';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'conversation_members'
    ) then
      execute 'alter publication supabase_realtime add table public.conversation_members';
    end if;
  end if;
end $$;
