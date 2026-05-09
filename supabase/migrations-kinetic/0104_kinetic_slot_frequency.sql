-- =============================================================================
-- 0104 — Frecuencia (semanal / quincenal / mensual) por slot del horario
-- =============================================================================
-- Hasta ahora cada slot del schedule_pattern_json se interpretaba como
-- "todos los <día> del mes" (semanal). Esto causaba que terapias con cuota
-- mensual baja se concentraran en las primeras semanas (cuota clamp).
--
-- Nueva opción `frequency` por slot:
--   'weekly'    (default si no está) → todos los matches del mes
--   'biweekly'  → cada 14 días desde el primer match del mes
--   'monthly'   → solo el primer match del mes
--
-- Ejemplo: Ocupacional, Lunes 14:00, frequency='biweekly' en junio 2026:
--   Mondays = [1, 8, 15, 22, 29], biweekly → [1, 15, 29].
--   Si la cuota es 2, el clamp de 0102 deja [1, 15] (distribuido).
--
-- Backward compat: slots sin frequency se tratan como 'weekly'.
-- =============================================================================

-- ── 1. Helper: expand un slot con frecuencia ────────────────────────────────

create or replace function public._kn_slot_dates_in_month(
  p_period_month date,
  p_day_of_week  text,
  p_time_local   text,
  p_duration_min int,
  p_frequency    text default 'weekly'   -- nuevo arg (sobrecarga)
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable as $$
declare
  v_dow_int int := public._kn_dow_to_int(p_day_of_week);
  v_first   date := date_trunc('month', p_period_month)::date;
  v_last    date := (v_first + interval '1 month' - interval '1 day')::date;
  v_d       date;
  v_match_idx int := 0;       -- contador de matches (0-indexed)
  v_freq    text := lower(coalesce(p_frequency, 'weekly'));
begin
  if v_dow_int is null then return; end if;

  for v_d in select generate_series(v_first, v_last, interval '1 day')::date loop
    if extract(dow from v_d)::int = v_dow_int then
      -- Decidir si este match cuenta según la frecuencia
      if v_freq = 'monthly' then
        if v_match_idx > 0 then
          v_match_idx := v_match_idx + 1;
          continue;
        end if;
      elsif v_freq = 'biweekly' then
        if (v_match_idx % 2) <> 0 then
          v_match_idx := v_match_idx + 1;
          continue;
        end if;
      end if;
      -- weekly: siempre incluir

      starts_at := (v_d::text || ' ' || p_time_local)::timestamp at time zone 'America/El_Salvador';
      ends_at   := starts_at + (p_duration_min || ' minutes')::interval;
      return next;
      v_match_idx := v_match_idx + 1;
    end if;
  end loop;
end;
$$;


-- ── 2. compute_monthly_appointment_candidates: pasar frequency del slot ────
-- (mismo cuerpo que 0102, solo cambio la llamada al helper para pasar frequency)

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id     uuid,
  p_period_month date
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_overquota_skip  jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_per_service     jsonb := '{}';
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';
  v_therapy         jsonb;
  v_kept_arr        jsonb;
  v_quota           int;
  v_idx             int;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_quota_map := v_quota_map || jsonb_build_object(
        v_therapy->>'service',
        coalesce((v_therapy->>'sessions_per_month')::int, 0)
      );
    end if;
  end loop;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30),
          coalesce(v_slot->>'frequency', 'weekly')   -- nuevo
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  for v_service_key in select jsonb_object_keys(v_per_service)
  loop
    v_service_arr := v_per_service->v_service_key;
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0);

    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    if v_quota <= 0 then
      v_overquota_skip := v_overquota_skip || v_service_arr;
      continue;
    end if;

    if jsonb_array_length(v_service_arr) <= v_quota then
      v_candidates := v_candidates || v_service_arr;
    else
      v_kept_arr := '[]'::jsonb;
      v_idx := 0;
      for v_cand_obj in select * from jsonb_array_elements(v_service_arr)
      loop
        if v_idx < v_quota then
          v_kept_arr := v_kept_arr || jsonb_build_array(v_cand_obj);
        else
          v_overquota_skip := v_overquota_skip || jsonb_build_array(v_cand_obj);
        end if;
        v_idx := v_idx + 1;
      end loop;
      v_candidates := v_candidates || v_kept_arr;
    end if;
  end loop;

  for v_cand_obj in select * from jsonb_array_elements(v_candidates)
  loop
    for v_conflict in
      select a.id, a.starts_at, a.child_id
        from public.appointments a
       where a.therapist_id = v_plan.primary_therapist_id
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_cand_obj->>'ends_at')::timestamptz
         and a.ends_at   > (v_cand_obj->>'starts_at')::timestamptz
    loop
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'candidate', v_cand_obj,
        'conflicting_appointment_id', v_conflict.id,
        'conflict_starts_at', v_conflict.starts_at,
        'conflict_child_id', v_conflict.child_id
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'skipped_overquota', v_overquota_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip),
      'skipped_overquota_count', jsonb_array_length(v_overquota_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;

-- ── Fin de migración 0104_kinetic_slot_frequency ───────────────────────────
