-- Migración 0064: Sesiones de jornada (clock in/out)
-- Independiente del sistema time_entries: mide "tiempo online" desde clock-in hasta clock-out,
-- con pausas (almuerzo / away) que se suman pero no cuentan como tiempo activo.
-- Sirve para comparar tiempo online vs tiempo productivo (suma de time_entries durante la jornada).

begin;

create type work_session_status as enum ('active', 'on_lunch', 'on_away', 'ended');

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status work_session_status not null default 'active',
  notes text,
  -- Pausas: array de { type: 'lunch'|'away', started_at, ended_at? }
  breaks_json jsonb not null default '[]'::jsonb,
  -- Calculados al cerrar la sesión
  total_seconds integer,           -- tiempo online sin pausas (started_at..ended_at − Σ pausas cerradas)
  productive_seconds integer,      -- suma de duration_seconds de time_entries del usuario en la ventana
  created_at timestamptz not null default now()
);

-- Solo una sesión activa por usuario (sin ended_at)
create unique index idx_work_sessions_one_active
  on public.work_sessions(user_id)
  where ended_at is null;

create index idx_work_sessions_user_started
  on public.work_sessions(user_id, started_at desc);

alter table public.work_sessions enable row level security;

-- Cada usuario gestiona sus propias sesiones
create policy "shifts_self" on public.work_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins y supervisores pueden leer las sesiones de todos (para reportes)
create policy "shifts_admin_supervisor_select" on public.work_sessions
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'supervisor')
    )
  );

commit;
