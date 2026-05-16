-- Stage B: horarios laborales configurables por terapista + max horas semanales
-- Permite calcular ocupación real (horas agendadas / horas contractuales) y
-- detectar terapistas sobrecargadas o subutilizadas.

create table if not exists public.therapist_work_schedule (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=dom, 6=sáb
  start_time time not null,
  end_time time not null check (end_time > start_time),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists therapist_work_schedule_therapist_idx
  on public.therapist_work_schedule(therapist_id, day_of_week);

-- Máximo de horas semanales contractadas (opcional). Si null, se asume el
-- agregado de los bloques en therapist_work_schedule como capacidad teórica.
alter table public.users
  add column if not exists max_hours_per_week numeric(5,2);

-- RLS
alter table public.therapist_work_schedule enable row level security;

drop policy if exists "tws read agency" on public.therapist_work_schedule;
create policy "tws read agency" on public.therapist_work_schedule
  for select using (public.is_agency_user());

drop policy if exists "tws insert directora admin" on public.therapist_work_schedule;
create policy "tws insert directora admin" on public.therapist_work_schedule
  for insert with check (public.is_directora_or_admin());

drop policy if exists "tws update directora admin" on public.therapist_work_schedule;
create policy "tws update directora admin" on public.therapist_work_schedule
  for update using (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());

drop policy if exists "tws delete directora admin" on public.therapist_work_schedule;
create policy "tws delete directora admin" on public.therapist_work_schedule
  for delete using (public.is_directora_or_admin());

-- Trigger updated_at
create trigger therapist_work_schedule_updated_at
  before update on public.therapist_work_schedule
  for each row execute function extensions.moddatetime(updated_at);

-- Grants
grant all on public.therapist_work_schedule to anon, authenticated, service_role;
