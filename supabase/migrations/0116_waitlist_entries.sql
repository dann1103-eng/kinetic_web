-- Stage C: lista de espera interna para familias que solicitan cita y no
-- pueden agendarse inmediatamente. Gestionada por coordinadora_familias /
-- coordinadora_terapias / directora / admin / recepcion.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'waitlist_status') then
    create type public.waitlist_status as enum (
      'waiting',
      'contacted',
      'scheduled',
      'dropped'
    );
  end if;
end $$;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),

  -- Datos del niño
  child_full_name text not null,
  child_birthdate date,
  child_diagnosis text,

  -- Contacto del padre/madre
  parent_full_name text not null,
  parent_phone text not null,
  parent_email text,

  -- Necesidad terapéutica
  requested_service_type text not null check (requested_service_type in (
    'lenguaje', 'motricidad_gruesa', 'motricidad_fina', 'sensorial',
    'psicologica', 'ocupacional', 'fisica', 'lectoescritura',
    'funciones_ejecutivas', 'conductual', 'blue_kids', 'alim_deglu',
    'destreza_manual_pre_escritura', 'otra'
  )),
  preferred_therapist_id uuid references public.users(id) on delete set null,
  preferred_days text,  -- texto libre: "lunes/miércoles tarde"
  notes text,

  -- Origen (referido por médico, colegio, etc.)
  referral_source_id uuid references public.referral_sources(id) on delete set null,

  -- Estado y prioridad
  status public.waitlist_status not null default 'waiting',
  priority smallint not null default 0 check (priority between 0 and 2), -- 0=normal,1=alta,2=urgente

  -- Auditoría
  added_by_user_id uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by_user_id uuid references public.users(id) on delete set null,
  dropped_at timestamptz,
  dropped_reason text,
  scheduled_child_id uuid references public.children(id) on delete set null,

  updated_at timestamptz not null default now()
);

create index if not exists waitlist_status_idx
  on public.waitlist_entries(status, requested_service_type);
create index if not exists waitlist_priority_idx
  on public.waitlist_entries(priority desc, added_at);

-- RLS
alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist read coord" on public.waitlist_entries;
create policy "waitlist read coord" on public.waitlist_entries
  for select using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist insert coord" on public.waitlist_entries;
create policy "waitlist insert coord" on public.waitlist_entries
  for insert with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist update coord" on public.waitlist_entries;
create policy "waitlist update coord" on public.waitlist_entries
  for update using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  )
  with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist delete admin" on public.waitlist_entries;
create policy "waitlist delete admin" on public.waitlist_entries
  for delete using (public.is_directora_or_admin());

-- Trigger updated_at
create trigger waitlist_entries_updated_at
  before update on public.waitlist_entries
  for each row execute function extensions.moddatetime(updated_at);

-- Grants
grant all on public.waitlist_entries to anon, authenticated, service_role;
