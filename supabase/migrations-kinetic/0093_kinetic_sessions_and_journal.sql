-- =============================================================================
-- 0093 — therapy_sessions + child_journal_entries
-- =============================================================================

-- ── 1. therapy_sessions ──────────────────────────────────────────────────────

create table if not exists public.therapy_sessions (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  therapist_id   uuid not null references public.users(id) on delete set null,
  child_id       uuid not null references public.children(id) on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  status         text not null default 'active'
                   check (status in ('active', 'completed')),
  created_at     timestamptz not null default now()
);

create index if not exists therapy_sessions_therapist_started
  on public.therapy_sessions (therapist_id, started_at desc);
create index if not exists therapy_sessions_appointment
  on public.therapy_sessions (appointment_id);

-- Trigger: protect immutable fields (appointment_id, child_id)
create or replace function public.trg_therapy_sessions_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.appointment_id is distinct from old.appointment_id
     or new.child_id is distinct from old.child_id then
    raise exception 'appointment_id y child_id son inmutables en therapy_sessions';
  end if;
  return new;
end;
$$;

drop trigger if exists therapy_sessions_immutable on public.therapy_sessions;
create trigger therapy_sessions_immutable
  before update on public.therapy_sessions
  for each row execute function public.trg_therapy_sessions_immutable_fields();

-- ── 2. child_journal_entries ─────────────────────────────────────────────────

create table if not exists public.child_journal_entries (
  id                    uuid primary key default gen_random_uuid(),
  child_id              uuid not null references public.children(id) on delete cascade,
  author_user_id        uuid references public.users(id) on delete set null,
  category              text not null
                          check (category in ('home_exercise','observation','question','response')),
  body                  text not null,
  attachments_json      jsonb not null default '[]',
  visible_to_family     boolean not null default false,
  linked_appointment_id uuid references public.appointments(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists child_journal_entries_child_created
  on public.child_journal_entries (child_id, created_at desc);
create index if not exists child_journal_entries_author
  on public.child_journal_entries (author_user_id);

-- updated_at trigger via moddatetime extension
create extension if not exists moddatetime schema extensions;

drop trigger if exists child_journal_entries_updated_at on public.child_journal_entries;
create trigger child_journal_entries_updated_at
  before update on public.child_journal_entries
  for each row execute function extensions.moddatetime(updated_at);

-- ── 3. PL/pgSQL: start_therapy_session ───────────────────────────────────────
-- Atomic: INSERT session + UPDATE appointment.status in one transaction.
-- Uses FOR UPDATE lock to prevent concurrent starts for the same appointment.

create or replace function public.start_therapy_session(
  p_appointment_id uuid,
  p_therapist_id   uuid
) returns public.therapy_sessions language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_session public.therapy_sessions;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
     and therapist_id = p_therapist_id
     and status = 'scheduled'
   for update;

  if not found then
    raise exception 'appointment_not_found_or_not_eligible';
  end if;

  insert into public.therapy_sessions (appointment_id, therapist_id, child_id)
    values (p_appointment_id, p_therapist_id, v_appt.child_id)
    returning * into v_session;

  update public.appointments
     set status = 'in_progress'
   where id = p_appointment_id;

  return v_session;
end;
$$;

-- ── 4. PL/pgSQL: finish_therapy_session ──────────────────────────────────────

create or replace function public.finish_therapy_session(
  p_session_id   uuid,
  p_therapist_id uuid
) returns public.therapy_sessions language plpgsql security definer as $$
declare
  v_session public.therapy_sessions;
begin
  select * into v_session
    from public.therapy_sessions
   where id = p_session_id
   for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.therapist_id is distinct from p_therapist_id then
    raise exception 'not_authorized';
  end if;

  -- Idempotent: already completed → return current state
  if v_session.status = 'completed' then
    return v_session;
  end if;

  update public.therapy_sessions
     set ended_at = now(),
         status   = 'completed'
   where id = p_session_id
   returning * into v_session;

  update public.appointments
     set status = 'completed'
   where id = v_session.appointment_id;

  return v_session;
end;
$$;

-- ── 5. RLS: therapy_sessions ─────────────────────────────────────────────────

alter table public.therapy_sessions enable row level security;

drop policy if exists "ts select staff or own" on public.therapy_sessions;
create policy "ts select staff or own"
  on public.therapy_sessions for select
  using (public.is_agency_user() or therapist_id = auth.uid());

drop policy if exists "ts insert own or admin" on public.therapy_sessions;
create policy "ts insert own or admin"
  on public.therapy_sessions for insert
  with check (therapist_id = auth.uid() or public.is_admin());

drop policy if exists "ts update own" on public.therapy_sessions;
create policy "ts update own"
  on public.therapy_sessions for update
  using  (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists "ts update admin" on public.therapy_sessions;
create policy "ts update admin"
  on public.therapy_sessions for update
  using  (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ts delete admin" on public.therapy_sessions;
create policy "ts delete admin"
  on public.therapy_sessions for delete
  using (public.is_admin());

-- ── 6. RLS: child_journal_entries ────────────────────────────────────────────

alter table public.child_journal_entries enable row level security;

drop policy if exists "cje select staff" on public.child_journal_entries;
create policy "cje select staff"
  on public.child_journal_entries for select
  using (public.is_agency_user());

drop policy if exists "cje select family" on public.child_journal_entries;
create policy "cje select family"
  on public.child_journal_entries for select
  using (visible_to_family = true and public.is_family_of_child(child_id));

drop policy if exists "cje insert staff" on public.child_journal_entries;
create policy "cje insert staff"
  on public.child_journal_entries for insert
  with check (public.is_agency_user() and author_user_id = auth.uid());

drop policy if exists "cje insert family" on public.child_journal_entries;
create policy "cje insert family"
  on public.child_journal_entries for insert
  with check (
    public.is_family_of_child(child_id)
    and category = 'response'
    and visible_to_family = true
    and author_user_id = auth.uid()
  );

drop policy if exists "cje update staff author or admin" on public.child_journal_entries;
create policy "cje update staff author or admin"
  on public.child_journal_entries for update
  using  (public.is_agency_user() and (author_user_id = auth.uid() or public.is_admin()))
  with check (public.is_agency_user() and (author_user_id = auth.uid() or public.is_admin()));

drop policy if exists "cje delete admin" on public.child_journal_entries;
create policy "cje delete admin"
  on public.child_journal_entries for delete
  using (public.is_admin());

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

grant all on public.therapy_sessions to anon, authenticated, service_role;
grant all on public.child_journal_entries to anon, authenticated, service_role;

-- ── 8. Realtime ───────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'therapy_sessions'
    ) then
      execute 'alter publication supabase_realtime add table public.therapy_sessions';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'child_journal_entries'
    ) then
      execute 'alter publication supabase_realtime add table public.child_journal_entries';
    end if;
  end if;
end $$;
