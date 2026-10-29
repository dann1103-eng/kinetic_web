-- =============================================================================
-- 0187 — Una reposición ('replacement') también se puede marcar como inasistencia
-- =============================================================================
-- BUG REPORTADO: la terapista agenda una reposición, el niño/a no se presenta y
-- al darle "Inasistencia" en /mi-dia sale "La cita no está en un estado donde se
-- pueda marcar inasistencia." — no hay forma de reprogramar esa reposición.
--
-- Causa: `mark_appointment_absence` (0160) solo aceptaba status in
-- ('scheduled','in_progress'). Una reposición nace directamente en
-- 'replacement' (resolve_absence_with_replacement, 0155) y nunca pasa por
-- 'scheduled', así que la RPC lanzaba `invalid_state_for_absence`. Es el mismo
-- hueco que la 0183 ya cerró para `start_therapy_session`: el botón se muestra
-- (BigSessionCard acepta 'replacement' desde la 0183) pero la RPC lo rechazaba.
--
-- FIX: se redefine `mark_appointment_absence` VERBATIM de 0160, ampliando solo
-- el filtro de estado. Misma firma — sin overload.
--
-- Efecto al marcar la inasistencia de una reposición: la cita pasa a 'no_show' y
-- se crea una ausencia NUEVA (appointment_absences es única por appointment_id,
-- y la reposición es otra cita) en 'pending' → vuelve a /aprobaciones para
-- reagendar. La ausencia original sigue 'replaced'. La ventana de reposición de
-- 30 días corre desde `reported_at` de la ausencia nueva.
-- =============================================================================

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

  -- [0187] 'replacement': una reposición también puede ser inasistente.
  if v_appt.status not in ('scheduled','in_progress','replacement') then
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

-- ── Fin de migración 0187 ────────────────────────────────────────────────────
