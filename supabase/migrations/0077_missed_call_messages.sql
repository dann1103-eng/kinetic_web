-- 0077_missed_call_messages.sql
-- Soporte para mensajes de sistema en conversaciones (inicio: llamada perdida).

begin;

alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'system_missed_call'));

create index if not exists messages_kind_idx
  on public.messages(conversation_id, kind)
  where kind <> 'text';

-- Realtime ya cubre messages (migración 0050). Sin cambios.

commit;
