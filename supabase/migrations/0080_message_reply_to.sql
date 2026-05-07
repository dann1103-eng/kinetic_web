-- Soporte para responder mensajes en el inbox (reply-to thread).
-- reply_to_message_id apunta al mensaje original; SET NULL si el original se borra.
alter table public.messages
  add column if not exists reply_to_message_id uuid
    references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages(reply_to_message_id)
  where reply_to_message_id is not null;
