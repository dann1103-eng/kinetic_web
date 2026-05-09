-- =============================================================================
-- 0100 — Treatment plans + audit log + appointment absences (Ronda 1)
-- =============================================================================
-- Captura digital de la "Ficha de acuerdo final" del Excel:
--   * Qué terapias recibe el niño (chechbox del formato)
--   * Patrón de horario semanal recurrente (grilla días × horas)
--   * Costos por terapia (cantidad/mes + costo unitario)
--
-- Plus: workflow de inasistencias — la terapista marca "Inasistencia" desde
-- /mi-dia, queda una solicitud en `appointment_absences` que la directora
-- procesa en /aprobaciones (reagenda a nuevo slot O hace waive con motivo).
--
-- Decisiones cerradas (ver plan):
--   - Versionado in-place + audit log (no snapshot por versión)
--   - Auto-agendamiento mensual NO está acá (Ronda 2)
--   - Service types extendidos con 3 nuevos para alinear con el Excel
-- =============================================================================


-- ── 1. Extender service_type del Excel ──────────────────────────────────────
-- El checkbox del Excel incluye 3 servicios que no estaban en el enum de
-- Fase 2 (mig 0092): BlueKids, Alimentación y deglución, Destreza manual y
-- pre-escritura. Los demás (THL=lenguaje, T.Ocupacional=ocupacional, etc.)
-- ya existían.

alter table public.appointments
  drop constraint if exists appointments_service_type_check;

alter table public.appointments
  add constraint appointments_service_type_check check (service_type in (
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
    'blue_kids',
    'alim_deglu',
    'destreza_manual_pre_escritura',
    'otra'
  ));


-- ── 2. treatment_plans ──────────────────────────────────────────────────────

create table if not exists public.treatment_plans (
  id                       uuid primary key default gen_random_uuid(),
  child_id                 uuid not null unique references public.children(id) on delete cascade,
  primary_therapist_id     uuid references public.users(id) on delete set null,
  diagnosis_text           text,
  starts_at                date,
  age_at_start_text        text,
  -- Array<{ service, active, sessions_per_month, unit_cost_usd }>
  therapies_json           jsonb not null default '[]',
  -- Array<{ day_of_week, time_local 'HH:MM', duration_minutes, service }>
  schedule_pattern_json    jsonb not null default '[]',
  observations             text,
  monthly_total_usd        numeric(10,2),
  signed_at                timestamptz,
  signed_by_user_id        uuid references public.users(id) on delete set null,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  updated_by_user_id       uuid references public.users(id) on delete set null
);

create index if not exists treatment_plans_child_id on public.treatment_plans(child_id);
create index if not exists treatment_plans_therapist
  on public.treatment_plans(primary_therapist_id) where primary_therapist_id is not null;

drop trigger if exists treatment_plans_updated_at on public.treatment_plans;
create trigger treatment_plans_updated_at
  before update on public.treatment_plans
  for each row execute function extensions.moddatetime(updated_at);

alter table public.treatment_plans enable row level security;

drop policy if exists "tp select staff" on public.treatment_plans;
create policy "tp select staff"
  on public.treatment_plans for select using (public.is_agency_user());

drop policy if exists "tp insert mgmt" on public.treatment_plans;
create policy "tp insert mgmt"
  on public.treatment_plans for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "tp update mgmt" on public.treatment_plans;
create policy "tp update mgmt"
  on public.treatment_plans for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "tp delete admin" on public.treatment_plans;
create policy "tp delete admin"
  on public.treatment_plans for delete using (public.is_admin());

grant all on public.treatment_plans to anon, authenticated, service_role;


-- ── 3. treatment_plan_changes (append-only audit) ───────────────────────────

create table if not exists public.treatment_plan_changes (
  id                  uuid primary key default gen_random_uuid(),
  treatment_plan_id   uuid not null references public.treatment_plans(id) on delete cascade,
  changed_at          timestamptz not null default now(),
  changed_by_user_id  uuid references public.users(id) on delete set null,
  before_json         jsonb not null,
  after_json          jsonb not null,
  kind                text not null check (kind in ('create','update','deactivate')),
  notes               text
);

create index if not exists treatment_plan_changes_plan_id
  on public.treatment_plan_changes(treatment_plan_id, changed_at desc);

alter table public.treatment_plan_changes enable row level security;

drop policy if exists "tpc select staff" on public.treatment_plan_changes;
create policy "tpc select staff"
  on public.treatment_plan_changes for select using (public.is_agency_user());

drop policy if exists "tpc insert mgmt" on public.treatment_plan_changes;
create policy "tpc insert mgmt"
  on public.treatment_plan_changes for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

-- No update ni delete: append-only.

grant all on public.treatment_plan_changes to anon, authenticated, service_role;


-- ── 4. appointment_absences (solicitudes de reposición) ─────────────────────

create table if not exists public.appointment_absences (
  id                           uuid primary key default gen_random_uuid(),
  appointment_id               uuid not null unique references public.appointments(id) on delete cascade,
  child_id                     uuid not null references public.children(id) on delete cascade,
  therapist_id                 uuid references public.users(id) on delete set null,
  reported_by_user_id          uuid references public.users(id) on delete set null,
  reported_at                  timestamptz not null default now(),
  reason                       text,
  status                       text not null default 'pending'
                                 check (status in ('pending','replaced','waived')),
  resolved_at                  timestamptz,
  resolved_by_user_id          uuid references public.users(id) on delete set null,
  replacement_appointment_id   uuid references public.appointments(id) on delete set null,
  waive_reason                 text,
  created_at                   timestamptz not null default now()
);

create index if not exists appointment_absences_status_pending
  on public.appointment_absences(status, reported_at desc) where status = 'pending';
create index if not exists appointment_absences_child
  on public.appointment_absences(child_id);

alter table public.appointment_absences enable row level security;

drop policy if exists "aa select staff" on public.appointment_absences;
create policy "aa select staff"
  on public.appointment_absences for select using (public.is_agency_user());

drop policy if exists "aa insert therapist or admin" on public.appointment_absences;
create policy "aa insert therapist or admin"
  on public.appointment_absences for insert
  with check (
    therapist_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "aa update mgmt" on public.appointment_absences;
create policy "aa update mgmt"
  on public.appointment_absences for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "aa delete admin" on public.appointment_absences;
create policy "aa delete admin"
  on public.appointment_absences for delete using (public.is_admin());

grant all on public.appointment_absences to anon, authenticated, service_role;


-- ── 5. RPC: mark_appointment_absence ────────────────────────────────────────
-- Atómico: cambia appointment.status='no_show' + inserta/upsert absence pending.

create or replace function public.mark_appointment_absence(
  p_appointment_id uuid,
  p_reason         text default null
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_absence public.appointment_absences;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
   for update;

  if not found then
    raise exception 'appointment_not_found';
  end if;

  -- Autoriza al terapista del appt o admin (impersonación)
  if v_appt.therapist_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_appt.status not in ('scheduled','in_progress') then
    raise exception 'invalid_state_for_absence';
  end if;

  update public.appointments
     set status = 'no_show'
   where id = p_appointment_id;

  insert into public.appointment_absences (
    appointment_id, child_id, therapist_id, reported_by_user_id, reason
  ) values (
    p_appointment_id,
    v_appt.child_id,
    v_appt.therapist_id,
    auth.uid(),
    nullif(trim(coalesce(p_reason,'')),'')
  )
  on conflict (appointment_id) do update set
    status = 'pending',
    reported_at = now(),
    reported_by_user_id = auth.uid(),
    reason = excluded.reason,
    resolved_at = null,
    resolved_by_user_id = null,
    replacement_appointment_id = null,
    waive_reason = null
  returning * into v_absence;

  return v_absence;
end;
$$;


-- ── 6. RPC: resolve_absence_with_replacement ────────────────────────────────
-- Crea un appointment de status='replacement' apuntando al original via
-- parent_appointment_id, y marca la solicitud como 'replaced'.

create or replace function public.resolve_absence_with_replacement(
  p_absence_id   uuid,
  p_starts_at    timestamptz,
  p_ends_at      timestamptz,
  p_therapist_id uuid,
  p_modality     text default 'presencial',
  p_notes        text default null
) returns public.appointments language plpgsql security definer as $$
declare
  v_absence    public.appointment_absences;
  v_orig       public.appointments;
  v_replacement public.appointments;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias')
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_absence
    from public.appointment_absences
   where id = p_absence_id
   for update;

  if not found then raise exception 'absence_not_found'; end if;
  if v_absence.status <> 'pending' then
    raise exception 'absence_already_resolved';
  end if;

  select * into v_orig
    from public.appointments
   where id = v_absence.appointment_id;

  if not found then raise exception 'original_appointment_missing'; end if;

  if p_ends_at <= p_starts_at then
    raise exception 'invalid_time_range';
  end if;

  insert into public.appointments (
    child_id, therapist_id, event_type, service_type, modality,
    starts_at, ends_at, status, parent_appointment_id, created_by_user_id, notes
  ) values (
    v_orig.child_id,
    p_therapist_id,
    v_orig.event_type,
    v_orig.service_type,
    p_modality,
    p_starts_at,
    p_ends_at,
    'replacement',
    v_orig.id,
    auth.uid(),
    p_notes
  )
  returning * into v_replacement;

  update public.appointment_absences
     set status = 'replaced',
         resolved_at = now(),
         resolved_by_user_id = auth.uid(),
         replacement_appointment_id = v_replacement.id
   where id = p_absence_id;

  return v_replacement;
end;
$$;


-- ── 7. RPC: waive_absence (no reponer con motivo) ──────────────────────────

create or replace function public.waive_absence(
  p_absence_id uuid,
  p_reason     text
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_absence public.appointment_absences;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias')
  ) then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'reason_too_short';
  end if;

  update public.appointment_absences
     set status = 'waived',
         resolved_at = now(),
         resolved_by_user_id = auth.uid(),
         waive_reason = trim(p_reason)
   where id = p_absence_id and status = 'pending'
   returning * into v_absence;

  if not found then
    raise exception 'absence_not_found_or_resolved';
  end if;

  return v_absence;
end;
$$;


-- ── 8. Realtime para la bandeja en /aprobaciones ────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'appointment_absences'
    ) then
      execute 'alter publication supabase_realtime add table public.appointment_absences';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'treatment_plans'
    ) then
      execute 'alter publication supabase_realtime add table public.treatment_plans';
    end if;
  end if;
end $$;


-- ── Fin de migración 0100_kinetic_treatment_plans_and_absences ────────────
