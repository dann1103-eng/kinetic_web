-- =============================================================================
-- Kinetic — Fase 2 (slice C): Agenda + cierres institucionales
-- =============================================================================
-- Crea las tablas core de la agenda clínica:
--   1. appointments              — todas las citas (terapias + entrevistas + reuniones + evaluaciones + matutino)
--   2. institutional_calendar    — cierres oficiales (Semana Santa, asuetos, decretos)
--   3. virtual_meetings          — registro provider-agnostic de meetings (preparado para Meet)
--   4. google_workspace_config   — singleton (vacío en este slice)
--
-- Plus:
--   - Helper RLS is_family_of_child(child_id) para portal padres
--   - RLS policies completas (agency / therapist / family)
--   - Realtime habilitado en appointments
-- =============================================================================


-- ── 0. Helper RLS: is_family_of_child ───────────────────────────────────────
-- Análogo a is_family_member pero recibe child_id y resuelve via children.family_id.

create or replace function public.is_family_of_child(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.children c
    join public.family_users fu on fu.family_id = c.family_id
    where c.id = target_child_id
      and fu.user_id = auth.uid()
  );
$$;


-- ── 1. appointments ─────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id                          uuid primary key default gen_random_uuid(),
  child_id                    uuid not null references public.children(id) on delete cascade,
  therapist_id                uuid references public.users(id) on delete set null,
  event_type                  text not null check (event_type in (
    'terapia',
    'entrevista_directora',
    'reunion_padres',
    'reunion_colegio',
    'evaluacion',
    'programa_matutino'
  )),
  service_type                text check (service_type in (
    'lenguaje',
    'motricidad_gruesa',
    'motricidad_fina',
    'sensorial',
    'psicologica',
    'ocupacional',
    'fisica',
    'lectoescritura',
    'funciones_ejecutivas',
    'conductual',
    'otra'
  )),
  modality                    text not null default 'presencial' check (modality in ('presencial','virtual')),
  starts_at                   timestamptz not null,
  ends_at                     timestamptz not null,
  status                      text not null default 'scheduled' check (status in (
    'scheduled',
    'in_progress',
    'completed',
    'no_show',
    'late_cancel',
    'rescheduled',
    'replacement'
  )),
  parent_appointment_id       uuid references public.appointments(id) on delete set null,
  recurrence_rule             text,                                  -- rrule, placeholder Fase 4
  google_calendar_event_id    text,                                  -- placeholder Fase 2 next
  meet_link                   text,
  notification_sent_24h       boolean not null default false,
  notification_sent_1h        boolean not null default false,
  notes                       text,
  created_by_user_id          uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- Constraint: ends_at > starts_at y duración mínima 15 min
  constraint appointments_duration_check check (ends_at >= starts_at + interval '15 minutes'),
  -- Constraint: terapia requiere service_type y therapist_id
  constraint appointments_terapia_requires_service_and_therapist check (
    event_type <> 'terapia'
    or (service_type is not null and therapist_id is not null)
  )
);

create index if not exists appointments_therapist_starts_idx on public.appointments(therapist_id, starts_at);
create index if not exists appointments_child_starts_idx on public.appointments(child_id, starts_at);
create index if not exists appointments_starts_idx on public.appointments(starts_at desc);
create index if not exists appointments_active_idx on public.appointments(status) where status not in ('completed','rescheduled');
create index if not exists appointments_parent_idx on public.appointments(parent_appointment_id) where parent_appointment_id is not null;


-- ── 2. institutional_calendar ───────────────────────────────────────────────
create table if not exists public.institutional_calendar (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  type            text not null check (type in ('holiday','closure','gov_decree','kinetic_break')),
  name            text not null,
  description     text,
  all_day         boolean not null default true,
  year_recurring  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists institutional_calendar_date_idx on public.institutional_calendar(date);


-- ── 3. virtual_meetings ─────────────────────────────────────────────────────
create table if not exists public.virtual_meetings (
  id                  uuid primary key default gen_random_uuid(),
  appointment_id      uuid references public.appointments(id) on delete cascade,
  context             text not null check (context in (
    'therapy','directora_interview','parents_meeting','school_meeting','evaluation'
  )),
  provider            text not null default 'google_meet',
  external_event_id   text,
  join_url            text,
  scheduled_for       timestamptz not null,
  ends_at             timestamptz,
  status              text not null default 'scheduled' check (status in ('scheduled','started','ended','cancelled')),
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists virtual_meetings_appointment_idx on public.virtual_meetings(appointment_id) where appointment_id is not null;


-- ── 4. google_workspace_config (singleton) ──────────────────────────────────
create table if not exists public.google_workspace_config (
  id                          uuid primary key default gen_random_uuid(),
  service_account_email       text,
  calendar_id_master          text,
  dwd_active                  boolean not null default false,
  default_owner_email         text,
  configured_at               timestamptz,
  updated_at                  timestamptz not null default now()
);


-- ── 5. Triggers de updated_at ───────────────────────────────────────────────
drop trigger if exists trg_appointments_touch on public.appointments;
create trigger trg_appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_institutional_calendar_touch on public.institutional_calendar;
create trigger trg_institutional_calendar_touch before update on public.institutional_calendar
  for each row execute function public.touch_updated_at();


-- ── 6. RLS — appointments ───────────────────────────────────────────────────
alter table public.appointments enable row level security;

create policy "appointments_select_agency"
  on public.appointments for select
  using (public.is_agency_user());

create policy "appointments_select_therapist"
  on public.appointments for select
  using (therapist_id = auth.uid());

create policy "appointments_select_family"
  on public.appointments for select
  using (public.is_family_of_child(child_id));

create policy "appointments_insert_staff"
  on public.appointments for insert
  with check (
    public.is_agency_user()
    and (
      (select role from public.users where id = auth.uid()) in
      ('admin','supervisor','directora','coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

create policy "appointments_update_staff"
  on public.appointments for update
  using (
    public.is_agency_user()
    and (
      (select role from public.users where id = auth.uid()) in
      ('admin','supervisor','directora','coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

create policy "appointments_update_therapist"
  on public.appointments for update
  using (therapist_id = auth.uid());

create policy "appointments_delete_admin"
  on public.appointments for delete
  using (public.is_admin());


-- ── 7. RLS — institutional_calendar ─────────────────────────────────────────
alter table public.institutional_calendar enable row level security;

create policy "inst_cal_select_all_authed"
  on public.institutional_calendar for select
  using (auth.uid() is not null);

create policy "inst_cal_insert_admin"
  on public.institutional_calendar for insert
  with check (
    public.is_admin()
    or (select role from public.users where id = auth.uid()) = 'directora'
  );

create policy "inst_cal_update_admin"
  on public.institutional_calendar for update
  using (
    public.is_admin()
    or (select role from public.users where id = auth.uid()) = 'directora'
  );

create policy "inst_cal_delete_admin"
  on public.institutional_calendar for delete
  using (public.is_admin());


-- ── 8. RLS — virtual_meetings ──────────────────────────────────────────────
alter table public.virtual_meetings enable row level security;

create policy "virtual_meetings_select_agency"
  on public.virtual_meetings for select
  using (public.is_agency_user());

create policy "virtual_meetings_select_appointment_visible"
  on public.virtual_meetings for select
  using (
    appointment_id is not null
    and exists (
      select 1 from public.appointments a
      where a.id = virtual_meetings.appointment_id
        and (a.therapist_id = auth.uid() or public.is_family_of_child(a.child_id))
    )
  );

create policy "virtual_meetings_insert_staff"
  on public.virtual_meetings for insert
  with check (public.is_agency_user());

create policy "virtual_meetings_update_staff"
  on public.virtual_meetings for update
  using (public.is_agency_user());

create policy "virtual_meetings_delete_admin"
  on public.virtual_meetings for delete
  using (public.is_admin());


-- ── 9. RLS — google_workspace_config (admin-only) ──────────────────────────
alter table public.google_workspace_config enable row level security;

create policy "gw_config_select_admin"
  on public.google_workspace_config for select
  using (public.is_admin());

create policy "gw_config_insert_admin"
  on public.google_workspace_config for insert
  with check (public.is_admin());

create policy "gw_config_update_admin"
  on public.google_workspace_config for update
  using (public.is_admin());


-- ── 10. Grants ──────────────────────────────────────────────────────────────
grant all on public.appointments              to anon, authenticated, service_role;
grant all on public.institutional_calendar    to anon, authenticated, service_role;
grant all on public.virtual_meetings          to anon, authenticated, service_role;
grant all on public.google_workspace_config   to anon, authenticated, service_role;


-- ── 11. Realtime — appointments (para vista live de la agenda) ──────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
      execute 'alter publication supabase_realtime add table public.appointments';
    end if;
  end if;
end $$;


-- ── Fin de migración 0092_kinetic_appointments ─────────────────────────────
