-- ============================================================
-- FM CRM — Migration 0071: backfill de Laura y Samuel en canales existentes
-- ============================================================
-- Política: Laura Morataya (1c786d40-...) y P.A. Samuel Flores (32e9b7d5-...)
-- deben estar en TODOS los canales internos (type='channel' o 'voice_channel'),
-- nunca en DMs. El código de createChannel ya los agrega para canales nuevos
-- (src/lib/domain/team.ts → FORCE_CHANNEL_MEMBER_IDS); esta migración rellena
-- los canales que se crearon antes de la política.
--
-- Idempotente: ON CONFLICT DO NOTHING — si ya están agregados, no pasa nada.
-- ============================================================

insert into public.conversation_members (conversation_id, user_id)
select c.id, u.id
from public.conversations c
cross join (
  values
    ('1c786d40-7954-423b-8d8f-a6405a2f6053'::uuid),  -- Laura Morataya
    ('32e9b7d5-40eb-491b-a799-3b1597e4ebba'::uuid)   -- P.A. Samuel Flores
) as forced(id)
join public.users u on u.id = forced.id
where c.type in ('channel', 'voice_channel')
on conflict (conversation_id, user_id) do nothing;

notify pgrst, 'reload schema';
