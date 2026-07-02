-- =============================================================================
-- 0165 — Comentarios / bitácora por entrada de lista de espera
-- =============================================================================
-- Las familias en lista de espera aún no ingresan a terapias, pero su proceso
-- de ingreso tiene varios mini-pasos (enviar propuesta, proponer días/horas,
-- dar seguimiento, etc.). Hoy la lista solo permite cambiar de fase; se pedía
-- un espacio para dejar comentarios breves entre el equipo (ej. Josselin indica
-- a Laura/Diana "enviar propuesta"; Diana responde con opciones de día/hora).
--
-- Tabla append-only de comentarios ligada a cada waitlist_entry. Mismo set de
-- roles que gestiona la lista (coordinadoras, recepción, dirección/admin).
-- =============================================================================

create table if not exists public.waitlist_entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.waitlist_entries(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_entry_comments_entry_idx
  on public.waitlist_entry_comments(entry_id, created_at);

-- RLS — mismo criterio que waitlist_entries (staff de gestión).
alter table public.waitlist_entry_comments enable row level security;

drop policy if exists "waitlist_comments read coord" on public.waitlist_entry_comments;
create policy "waitlist_comments read coord" on public.waitlist_entry_comments
  for select using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist_comments insert coord" on public.waitlist_entry_comments;
create policy "waitlist_comments insert coord" on public.waitlist_entry_comments
  for insert with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

-- Borrar un comentario: su autor, o dirección/admin.
drop policy if exists "waitlist_comments delete own or admin" on public.waitlist_entry_comments;
create policy "waitlist_comments delete own or admin" on public.waitlist_entry_comments
  for delete using (
    author_user_id = auth.uid() or public.is_directora_or_admin()
  );

grant all on public.waitlist_entry_comments to anon, authenticated, service_role;

-- ── Fin de migración 0165_waitlist_entry_comments ────────────────────────────
