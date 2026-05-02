-- ============================================================
-- FM CRM — Migration 0070: arreglar unicidad de livekit_room_name
-- ============================================================
-- En 0069 se declaró `livekit_room_name UNIQUE` globalmente, pero la
-- convención `conv-{conversationId}` reusa siempre el mismo nombre de room
-- por conversación. Cuando termina una llamada y se inicia otra, el insert
-- falla con:
--   ERROR: duplicate key value violates unique constraint
--          "call_sessions_livekit_room_name_key"
--
-- Solución: la unicidad debe ser parcial — solo entre sesiones activas.
-- Una conversación puede tener N llamadas históricas con el mismo room name,
-- pero solo UNA activa a la vez.
-- ============================================================

-- 1) Drop la constraint UNIQUE global creada por la columna en 0069.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'call_sessions'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) ilike '%livekit_room_name%';

  if cname is not null then
    execute format('alter table public.call_sessions drop constraint %I', cname);
  end if;
end$$;

-- 2) Indice parcial que garantiza unicidad solo cuando la sesión sigue activa.
create unique index if not exists call_sessions_active_room_name_unique
  on public.call_sessions (livekit_room_name)
  where ended_at is null;

notify pgrst, 'reload schema';
