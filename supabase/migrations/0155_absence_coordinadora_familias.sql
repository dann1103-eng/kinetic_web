-- =============================================================================
-- 0155 — Reposiciones aprobables por AMBAS coordinadoras
-- =============================================================================
-- Hasta ahora resolve_absence_with_replacement / waive_absence solo permitían
-- admin / directora / coordinadora_terapias. Operativamente las DOS coordinadoras
-- (terapias y familias) aprueban reposiciones. Redefinimos ambos RPCs VERBATIM
-- (def. original en migrations-kinetic/0100), cambiando solo la autorización.
--
-- Misma firma → `create or replace` reemplaza sin crear sobrecarga (no DROP).
-- =============================================================================

-- ── resolve_absence_with_replacement ────────────────────────────────────────
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
      and role in ('admin','directora','coordinadora_terapias','coordinadora_familias')
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


-- ── waive_absence ───────────────────────────────────────────────────────────
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
      and role in ('admin','directora','coordinadora_terapias','coordinadora_familias')
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

-- ── Fin de migración 0155 ───────────────────────────────────────────────────
