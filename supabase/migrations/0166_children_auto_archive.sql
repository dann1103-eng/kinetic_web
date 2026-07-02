-- =============================================================================
-- 0166 — Auto-archivar niños 3 meses después de la baja (reversible)
-- =============================================================================
-- Pedido: "después de 3 meses de baja, el perfil del niño se borre del sistema".
-- Se implementa como ARCHIVADO reversible (no borrado físico): a los 3 meses de
-- estar en fase terminal (alta o retirado) el niño se marca `archived_at` y
-- desaparece de los listados operativos, pero sus datos e historial se conservan
-- y se pueden restaurar. El borrado físico manual sigue disponible aparte.
-- =============================================================================

alter table public.children
  add column if not exists archived_at timestamptz;

comment on column public.children.archived_at is
  'Mig 0166: si no es null, el niño está archivado (oculto de listados). Se setea '
  'automáticamente 3 meses después de entrar en fase terminal; reversible.';

create index if not exists children_archived_at_idx
  on public.children(archived_at) where archived_at is not null;

-- RPC: archiva a los niños en fase terminal cuya última transición de fase tenga
-- más de 3 meses y que aún no estén archivados. Devuelve cuántos archivó.
-- SECURITY DEFINER para poder llamarse desde el cron/Edge Function con service
-- role. Idempotente.
create or replace function public.archive_stale_discharged_children()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with archived as (
    update public.children
       set archived_at = now()
     where archived_at is null
       and current_phase_code in ('5_1_alta_terapeutica', '5_2_retirado')
       and current_phase_changed_at < (now() - interval '3 months')
    returning id
  )
  select count(*) into v_count from archived;
  return v_count;
end;
$$;

grant execute on function public.archive_stale_discharged_children()
  to authenticated, service_role;

-- ── Fin de migración 0166_children_auto_archive ──────────────────────────────
