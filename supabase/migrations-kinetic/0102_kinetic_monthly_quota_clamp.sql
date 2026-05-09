-- =============================================================================
-- 0102 — Cuota manda en la generación mensual
-- =============================================================================
-- Cambio de semántica respecto a 0101:
--   ANTES: el patrón semanal mandaba — si el patrón generaba 5 sesiones
--   pero la cuota era 2, se creaban las 5.
--   AHORA: la cuota (sessions_per_month por servicio del plan) manda —
--   si el patrón genera 5 pero la cuota es 2, se crean 2 (las primeras
--   cronológicamente) y las 3 restantes se reportan en
--   `skipped_overquota`.
--
-- Orden de procesamiento por servicio:
--   1. Expandir el patrón a candidatos del mes
--   2. Filtrar candidatos en holidays/closures → skipped_holidays
--   3. Si quedan más que la cuota → trim al primero N → skipped_overquota
--   4. Detectar conflictos sobre los que quedan
--
-- Razón: el usuario reportó confusión cuando un mes con 5 lunes generaba
-- 5 sesiones de Ocupacional aunque su cuota fuera 2. La cuota es el
-- contrato facturado y debe coincidir con la realidad agendada.
-- =============================================================================

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
  v_per_service     jsonb := '{}';     -- map service → array de candidatos pre-trim
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';     -- map service → sessions_per_month (de la therapy entry activa)
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

  if not found then
    raise exception 'no_active_treatment_plan';
  end if;

  if v_plan.primary_therapist_id is null then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  -- Construir map de cuota por servicio (solo terapias activas).
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_quota_map := v_quota_map || jsonb_build_object(
        v_therapy->>'service',
        coalesce((v_therapy->>'sessions_per_month')::int, 0)
      );
    end if;
  end loop;

  -- Paso 1+2: expandir slots, filtrar holidays, agrupar por servicio.
  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30)
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      -- Holiday check
      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      -- Acumular en bucket por servicio
      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  -- Paso 3: para cada servicio, ordenar por starts_at y recortar a la cuota.
  for v_service_key in select jsonb_object_keys(v_per_service)
  loop
    v_service_arr := v_per_service->v_service_key;
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0);

    -- Ordenar por starts_at (jsonb_path_query no ordena; lo hago via subquery con jsonb_array_elements)
    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    if v_quota <= 0 then
      -- Sin cuota: todos van a overquota
      v_overquota_skip := v_overquota_skip || v_service_arr;
      continue;
    end if;

    if jsonb_array_length(v_service_arr) <= v_quota then
      -- Cabe todo
      v_candidates := v_candidates || v_service_arr;
    else
      -- Trim: keep[0..quota-1], overquota[quota..]
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

  -- Paso 4: chequear conflictos solo sobre los que quedan en v_candidates.
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

-- ── Fin de migración 0102_kinetic_monthly_quota_clamp ──────────────────────
