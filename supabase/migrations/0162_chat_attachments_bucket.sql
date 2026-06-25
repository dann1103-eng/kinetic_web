-- 0162_chat_attachments_bucket.sql
-- Crea el bucket de adjuntos de chat + políticas RLS de Storage.
--
-- En 0040_inbox_chat.sql esto quedó documentado como paso MANUAL de Dashboard
-- (líneas 203-223, todo comentado) y nunca se automatizó. Al omitirse en el
-- proyecto vivo, subir un adjunto al chat falla → el chip sale en rojo y no se
-- puede enviar "solo archivo". Esta migración lo automatiza de forma idempotente,
-- espejo del patrón de 0143 (user-avatars).
--
-- Convención de path del uploader: {conversation_id}/{tmpId}/{tmpId}.{ext}
-- → (storage.foldername(name))[1] = conversation_id.

-- Bucket privado (los archivos se sirven con signed URLs desde el server).
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- INSERT: subir adjunto solo si sos miembro de la conversación.
drop policy if exists "chat_attachments_insert_member" on storage.objects;
create policy "chat_attachments_insert_member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and public.is_conversation_member( (storage.foldername(name))[1]::uuid )
);

-- SELECT: leer / crear signed URL solo si sos miembro de la conversación.
drop policy if exists "chat_attachments_select_member" on storage.objects;
create policy "chat_attachments_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and public.is_conversation_member( (storage.foldername(name))[1]::uuid )
);

-- DELETE: borrar adjunto solo si sos miembro de la conversación.
drop policy if exists "chat_attachments_delete_member" on storage.objects;
create policy "chat_attachments_delete_member"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and public.is_conversation_member( (storage.foldername(name))[1]::uuid )
);
