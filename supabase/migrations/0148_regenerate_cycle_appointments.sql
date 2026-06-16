-- =============================================================================
-- 0148 — Regenerar las citas de un ciclo mensual ya generado
-- =============================================================================
-- Permite, al EDITAR un ciclo pendiente (generated + payment_status='pending'),
-- regenerar las citas del mes para que coincidan con el plan/detalle nuevo.
--
-- Regla de seguridad:
--   • Preserva las citas ya completadas/en curso/repuestas (completed,
--     in_progress, replacement) y cualquier cita no auto-generada.
--   • Cancela (→ 'rescheduled') solo las 'scheduled' auto-generadas del mes
--     (mismo criterio que cancel_monthly_cycle: nota "Auto-generado del ciclo").
--   • Recrea desde el override (si se manda) o desde compute, con el mismo
--     chequeo de conflictos que la generación.
--
-- Orden importante: se cancelan PRIMERO las viejas y LUEGO se calculan/chequean
-- conflictos, para que las nuevas no choquen contra las que se están
-- reemplazando. La función es atómica: si hay conflicto, el RAISE revierte el
-- cancel.
--
-- Función NUEVA (sin colisión de sobrecargas). Espejo del bloque de citas de
-- confirm_monthly_payment_and_generate (0147).
-- =============================================================================

create or replace function public.regenerate_cycle_appointments(
  p_cycle_id              uuid,
  p_appointments_override jsonb default null
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle        public.monthly_session_cycles;
  v_plan         public.treatment_plans;
  v_period       date;
  v_first_day    date;
  v_last_day     date;
  v_compute      jsonb;
  v_summary      jsonb;
  v_candidate    jsonb;
  v_appointments_to_create jsonb;
  v_therapist_map jsonb := '{}';
  v_therapy      jsonb;
  v_cand_therapist uuid;
  v_conflict_count int := 0;
  v_appt_count   int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status <> 'generated' or v_cycle.payment_status <> 'pending' then
    raise exception 'cycle_not_editable';
  end if;

  v_period    := v_cycle.period_month;
  v_first_day := date_trunc('month', v_period)::date;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  select * into v_plan
    from public.treatment_plans
   where child_id = v_cycle.child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  -- Mapa terapista por servicio (igual que confirm).
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  -- 1) Cancelar las citas scheduled auto-generadas del mes (las ya iniciadas/
  --    completadas/repuestas se respetan). Se hace ANTES de calcular conflictos.
  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo regenerado'
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and notes like '%Auto-generado del ciclo%';

  -- 2) Determinar las citas a crear: override (validado) o compute.
  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    v_period_start_iso := (v_first_day::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_first_day + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;

      v_cand_therapist := coalesce(
        (v_candidate->>'therapist_id')::uuid,
        (v_therapist_map->>(v_candidate->>'service'))::uuid,
        v_plan.primary_therapist_id
      );
      select count(*) into v_conflict_count
        from public.appointments a
       where a.therapist_id = v_cand_therapist
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_candidate->>'ends_at')::timestamptz
         and a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      if v_conflict_count > 0 then
        raise exception 'has_conflicts: 1';
      end if;
    end loop;
  else
    -- compute ya excluye 'rescheduled' del chequeo de conflictos, así que las
    -- citas recién canceladas en el paso 1 no cuentan como choque.
    v_compute := public.compute_monthly_appointment_candidates(v_cycle.child_id, v_period, null);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  -- 3) Crear las citas nuevas.
  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      v_cycle.child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  update public.monthly_session_cycles
     set appointments_generated_count = v_appt_count,
         appointments_generated_at = now()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

grant execute on function public.regenerate_cycle_appointments(uuid, jsonb)
  to anon, authenticated, service_role;

-- ── Fin de migración 0148 ────────────────────────────────────────────────────
