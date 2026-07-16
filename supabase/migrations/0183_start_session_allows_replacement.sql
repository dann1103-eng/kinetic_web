-- =============================================================================
-- 0183 — Las reposiciones ('replacement') también se pueden iniciar
-- =============================================================================
-- BUG REPORTADO: una cita de reposición (status='replacement', creada por
-- resolve_absence_with_replacement) no mostraba el botón "Iniciar sesión" en
-- /mi-dia. Causa: `start_therapy_session` (mig 0093) solo aceptaba citas con
-- status='scheduled' — una reposición nunca pasa por ese estado (nace
-- directamente en 'replacement'), así que la RPC la rechazaba con
-- 'appointment_not_found_or_not_eligible' incluso si el botón llegara a
-- mostrarse (el fix del botón en BigSessionCard.tsx va aparte, en el mismo
-- commit de esta migración).
--
-- FIX: se redefine `start_therapy_session` VERBATIM salvo ampliar el filtro
-- de status para aceptar también 'replacement'. Misma firma — sin overload.
-- =============================================================================

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
     and status in ('scheduled', 'replacement')
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

-- ── Fin de migración 0183 ────────────────────────────────────────────────────
