-- =============================================================================
-- 0148 — Programas matutinos por GRUPO (BlueKids / LearningKids / Aula Educativa)
-- =============================================================================
-- Los programas matutinos funcionan como un colegio: grupos permanentes
-- liderados por maestras (compartidos/cubribles entre varias), todos entran a
-- la misma hora pero son grupos distintos. Una sesión es DEL GRUPO, no de cada
-- niño. Cada niño asiste una cantidad de días distinta (lo que paga).
--
-- Esta migración crea el modelo de datos. La lógica que deja de generar citas
-- individuales para servicios matutinos va en 0149.
--
-- Días de la semana: 'mon','tue','wed','thu','fri','sat','sun' (igual que
-- schedule_pattern_json.day_of_week).
-- =============================================================================

-- ── Helpers de autorización ──────────────────────────────────────────────────
create or replace function public.kn_can_manage_groups()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users
     where id = auth.uid()
       and role in ('admin','directora','coordinadora_terapias',
                    'coordinadora_familias','recepcion')
  );
$$;

create or replace function public.kn_is_group_staff(p_group_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.program_group_staff
     where group_id = p_group_id and user_id = auth.uid()
  );
$$;

-- ── 1. program_groups — el grupo (permanente) ────────────────────────────────
create table if not exists public.program_groups (
  id               uuid primary key default gen_random_uuid(),
  program          text not null check (program in
                     ('blue_kids','learning_kids','aula_educativa')),
  name             text not null,
  active           boolean not null default true,
  meeting_days     text[] not null default '{}',   -- {'mon','tue',...}
  start_time_local text not null default '07:30',   -- HH:MM (hora SV)
  duration_minutes int  not null default 180,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 2. program_group_staff — maestras del grupo (varias = compartido) ─────────
create table if not exists public.program_group_staff (
  group_id   uuid not null references public.program_groups(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  is_lead    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists program_group_staff_user_idx
  on public.program_group_staff(user_id);

-- ── 3. program_group_members — niños del grupo + sus días ─────────────────────
create table if not exists public.program_group_members (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.program_groups(id) on delete cascade,
  child_id        uuid not null references public.children(id) on delete cascade,
  attendance_days text[] not null default '{}',     -- subconjunto de meeting_days
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Un niño solo puede estar activo en un grupo a la vez (puede moverse al renovar ciclo).
create unique index if not exists program_group_members_active_child
  on public.program_group_members(child_id) where active;
create index if not exists program_group_members_group_idx
  on public.program_group_members(group_id) where active;

-- ── 4. program_group_sessions — cada reunión del grupo (una por día) ──────────
create table if not exists public.program_group_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.program_groups(id) on delete cascade,
  session_date date not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled','held','cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (group_id, session_date)
);
create index if not exists program_group_sessions_date_idx
  on public.program_group_sessions(session_date);

-- ── 5. program_session_attendance — la lista pasada ──────────────────────────
create table if not exists public.program_session_attendance (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.program_group_sessions(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  status            text not null default 'present'
                      check (status in ('present','absent','excused')),
  marked_by_user_id uuid references public.users(id) on delete set null,
  marked_at         timestamptz not null default now(),
  note              text,
  unique (session_id, child_id)
);
create index if not exists program_session_attendance_session_idx
  on public.program_session_attendance(session_id);

-- ── 6. Columnas snapshot en monthly_session_cycles ───────────────────────────
alter table public.monthly_session_cycles
  add column if not exists program_group_id uuid references public.program_groups(id) on delete set null,
  add column if not exists attendance_days text[];

-- ── 7. Triggers updated_at ───────────────────────────────────────────────────
drop trigger if exists program_groups_updated_at on public.program_groups;
create trigger program_groups_updated_at before update on public.program_groups
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists program_group_members_updated_at on public.program_group_members;
create trigger program_group_members_updated_at before update on public.program_group_members
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists program_group_sessions_updated_at on public.program_group_sessions;
create trigger program_group_sessions_updated_at before update on public.program_group_sessions
  for each row execute function extensions.moddatetime(updated_at);

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
alter table public.program_groups            enable row level security;
alter table public.program_group_staff       enable row level security;
alter table public.program_group_members     enable row level security;
alter table public.program_group_sessions    enable row level security;
alter table public.program_session_attendance enable row level security;

-- program_groups
drop policy if exists "pg select agency" on public.program_groups;
create policy "pg select agency" on public.program_groups
  for select using (public.is_agency_user());
drop policy if exists "pg write mgmt" on public.program_groups;
create policy "pg write mgmt" on public.program_groups
  for all using (public.kn_can_manage_groups()) with check (public.kn_can_manage_groups());

-- program_group_staff
drop policy if exists "pgs select agency" on public.program_group_staff;
create policy "pgs select agency" on public.program_group_staff
  for select using (public.is_agency_user());
drop policy if exists "pgs write mgmt" on public.program_group_staff;
create policy "pgs write mgmt" on public.program_group_staff
  for all using (public.kn_can_manage_groups()) with check (public.kn_can_manage_groups());

-- program_group_members
drop policy if exists "pgm select agency" on public.program_group_members;
create policy "pgm select agency" on public.program_group_members
  for select using (public.is_agency_user());
drop policy if exists "pgm write mgmt" on public.program_group_members;
create policy "pgm write mgmt" on public.program_group_members
  for all using (public.kn_can_manage_groups()) with check (public.kn_can_manage_groups());

-- program_group_sessions: gestión o staff del grupo pueden escribir (marcar held).
drop policy if exists "pgsess select agency" on public.program_group_sessions;
create policy "pgsess select agency" on public.program_group_sessions
  for select using (public.is_agency_user());
drop policy if exists "pgsess insert mgmt" on public.program_group_sessions;
create policy "pgsess insert mgmt" on public.program_group_sessions
  for insert with check (public.kn_can_manage_groups());
drop policy if exists "pgsess update mgmt or staff" on public.program_group_sessions;
create policy "pgsess update mgmt or staff" on public.program_group_sessions
  for update using (public.kn_can_manage_groups() or public.kn_is_group_staff(group_id))
  with check (public.kn_can_manage_groups() or public.kn_is_group_staff(group_id));
drop policy if exists "pgsess delete mgmt" on public.program_group_sessions;
create policy "pgsess delete mgmt" on public.program_group_sessions
  for delete using (public.kn_can_manage_groups());

-- program_session_attendance: gestión o staff del grupo de esa sesión.
drop policy if exists "psa select agency" on public.program_session_attendance;
create policy "psa select agency" on public.program_session_attendance
  for select using (public.is_agency_user());
drop policy if exists "psa write mgmt or staff" on public.program_session_attendance;
create policy "psa write mgmt or staff" on public.program_session_attendance
  for all using (
    public.kn_can_manage_groups()
    or exists (
      select 1 from public.program_group_sessions s
       where s.id = session_id and public.kn_is_group_staff(s.group_id)
    )
  ) with check (
    public.kn_can_manage_groups()
    or exists (
      select 1 from public.program_group_sessions s
       where s.id = session_id and public.kn_is_group_staff(s.group_id)
    )
  );

-- ── 9. Grants ────────────────────────────────────────────────────────────────
grant all on public.program_groups             to anon, authenticated, service_role;
grant all on public.program_group_staff        to anon, authenticated, service_role;
grant all on public.program_group_members      to anon, authenticated, service_role;
grant all on public.program_group_sessions     to anon, authenticated, service_role;
grant all on public.program_session_attendance to anon, authenticated, service_role;

-- ── Fin de migración 0148 ────────────────────────────────────────────────────
