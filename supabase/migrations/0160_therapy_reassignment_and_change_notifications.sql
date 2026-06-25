-- =============================================================================
-- 0159 — Gestión de terapias: pre-marcar inasistencia (coordinación), reasignar
--        terapista con traza de cobertura, y notificaciones de cambios de cita.
-- =============================================================================
-- Contexto: coordinación necesita (a) marcar la inasistencia de una terapia con
-- anticipación sin esperar a la terapeuta, y (b) reasignar/mover terapias con
-- aviso a las terapistas afectadas. Las notificaciones del feed (campana) son
-- computadas y solo detectan INSERTs de citas; no avisan a quien se le QUITA una
-- cita ni los UPDATE (mover/reasignar). Esta migración agrega el soporte de datos.
--
-- Cambios:
--   1) mark_appointment_absence: amplía autorización a roles de coordinación
--      (admin/directora/coordinadora_terapias/coordinadora_familias) además de la
--      terapista de la cita. Resto del cuerpo verbatim de 0147 (auto-waive de
--      programas matutinos incluido).
--   2) appointment_change_events: tabla append-only que dirige notificaciones a la
--      terapista afectada (movida / reasignada / asignada). RLS + realtime.
--   3) appointments.reassigned_from_therapist_id: traza de cobertura (NO marca
--      is_extra; admin/recepción deciden el pago extra a mano).
-- =============================================================================

-- ── 1. mark_appointment_absence: autorizar a coordinación ────────────────────
-- Reproducción verbatim de 0147; único cambio: el chequeo de autorización suma
-- a los roles de coordinación (vía current_user_role(), de 0117).
create or replace function public.mark_appointment_absence(
  p_appointment_id uuid,
  p_reason         text default null
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_absence public.appointment_absences;
  v_is_flat boolean := false;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
   for update;

  if not found then
    raise exception 'appointment_not_found';
  end if;

  -- Autoriza a la terapista del appt, admin (impersonación) o coordinación.
  if v_appt.therapist_id is distinct from auth.uid()
     and not public.is_admin()
     and public.current_user_role() not in
         ('directora','coordinadora_terapias','coordinadora_familias') then
    raise exception 'not_authorized';
  end if;

  if v_appt.status not in ('scheduled','in_progress') then
    raise exception 'invalid_state_for_absence';
  end if;

  update public.appointments
     set status = 'no_show'
   where id = p_appointment_id;

  -- Programa matutino (mensualidad): la falta NO genera pendiente de reposición.
  -- Queda auto-resuelta como 'waived' (auditada) y la cita en no_show para métricas.
  select exists (
    select 1
      from public.treatment_plans tp
      cross join lateral jsonb_array_elements(coalesce(tp.therapies_json,'[]'::jsonb)) t
     where tp.child_id = v_appt.child_id
       and tp.active
       and t->>'service' = v_appt.service_type
       and public._kn_is_monthly_flat(t)
  ) into v_is_flat;

  if v_is_flat then
    insert into public.appointment_absences (
      appointment_id, child_id, therapist_id, reported_by_user_id, reason,
      status, resolved_at, resolved_by_user_id, waive_reason
    ) values (
      p_appointment_id,
      v_appt.child_id,
      v_appt.therapist_id,
      auth.uid(),
      nullif(trim(coalesce(p_reason,'')),''),
      'waived', now(), auth.uid(),
      'Programa matutino (mensualidad) — no aplica reposición'
    )
    on conflict (appointment_id) do update set
      status = 'waived',
      reported_at = now(),
      reported_by_user_id = auth.uid(),
      reason = excluded.reason,
      resolved_at = now(),
      resolved_by_user_id = auth.uid(),
      replacement_appointment_id = null,
      waive_reason = 'Programa matutino (mensualidad) — no aplica reposición'
    returning * into v_absence;

    return v_absence;
  end if;

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

-- ── 2. appointment_change_events: notificaciones de cambios de cita ──────────
create table if not exists public.appointment_change_events (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  target_user_id  uuid not null references public.users(id) on delete cascade,
  actor_user_id   uuid references public.users(id) on delete set null,
  change_kind     text not null check (change_kind in ('moved','reassigned_away','assigned')),
  child_label     text,
  starts_at       timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.appointment_change_events is
  'Eventos de cambio de cita dirigidos a una terapista (feed de notificaciones). '
  'moved = se movió su cita; reassigned_away = se le quitó (reasignada a otra); '
  'assigned = se le asignó (cobertura). Append-only, leído por /api/notifications.';

create index if not exists appointment_change_events_target_idx
  on public.appointment_change_events (target_user_id, created_at desc);

alter table public.appointment_change_events enable row level security;

drop policy if exists appointment_change_events_select_own on public.appointment_change_events;
create policy appointment_change_events_select_own on public.appointment_change_events
  for select to authenticated
  using (target_user_id = auth.uid());

drop policy if exists appointment_change_events_insert_agency on public.appointment_change_events;
create policy appointment_change_events_insert_agency on public.appointment_change_events
  for insert to authenticated
  with check (public.is_agency_user());

-- Realtime: que la campana se actualice en vivo al recibir un evento.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'appointment_change_events'
  ) then
    execute 'alter publication supabase_realtime add table public.appointment_change_events';
  end if;
end $$;

-- ── 3. appointments.reassigned_from_therapist_id: traza de cobertura ─────────
alter table public.appointments
  add column if not exists reassigned_from_therapist_id uuid references public.users(id) on delete set null;

comment on column public.appointments.reassigned_from_therapist_id is
  'Terapista original de la que se reasignó esta cita (cobertura). Traza para que '
  'admin/recepción decidan pagarla como extraordinaria. NO marca is_extra automáticamente.';

-- ── Fin de migración 0159 ────────────────────────────────────────────────────
