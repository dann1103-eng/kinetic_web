-- =============================================================================
-- 0173 — Offset quincenal (1er/3er vs 2do/4to) para slots del horario
-- =============================================================================
-- Bug reportado: dos niños que vienen QUINCENAL el mismo día/hora con la misma
-- terapista SIEMPRE chocan al generar el ciclo, mes tras mes. Causa: en
-- `_kn_slot_dates_in_month`, la frecuencia 'biweekly' se queda con los matches
-- de índice PAR del mes (0, 2, 4... = 1er, 3er, 5to match del día de semana) sin
-- ninguna forma de configurar el otro grupo (2do, 4to). Un niño que en realidad
-- viene 2do y 4to sábado siempre se calculaba como si viniera 1er y 3er —
-- exactamente la misma semana que cualquier otro niño quincenal del mismo slot.
--
-- Fix: nuevo campo opcional `biweekly_offset` (0 default | 1) en cada slot de
-- `schedule_pattern_json`. offset=0 → 1er/3er (comportamiento actual, sin
-- cambios). offset=1 → 2do/4to. Así dos niños quincenales del mismo día/hora/
-- terapista pueden coexistir sin chocar, para siempre — sin arrastrar la cita
-- a mano cada mes en la previsualización de conflictos.
--
-- GOTCHA del repo: agregar un parámetro nuevo a una función cambia su firma
-- (distinto # de args) ⇒ CREATE OR REPLACE crea una SOBRECARGA en vez de
-- reemplazar. Por eso: DROP explícito de la firma vieja de 5 args antes de
-- crear la de 6 (con el nuevo arg default al final, así los callers viejos
-- que pasan 5 args explícitos siguen funcionando sin tocarlos).
-- =============================================================================

-- ── 1. _kn_slot_dates_in_month: nuevo 6º arg p_biweekly_offset ──────────────

drop function if exists public._kn_slot_dates_in_month(date, text, text, int, text);

create or replace function public._kn_slot_dates_in_month(
  p_period_month     date,
  p_day_of_week      text,
  p_time_local       text,
  p_duration_min     int,
  p_frequency        text default 'weekly',
  p_biweekly_offset  int  default 0        -- nuevo: 0=1er/3er · 1=2do/4to
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable as $$
declare
  v_dow_int   int := public._kn_dow_to_int(p_day_of_week);
  v_first     date := date_trunc('month', p_period_month)::date;
  v_last      date := (v_first + interval '1 month' - interval '1 day')::date;
  v_d         date;
  v_match_idx int := 0;       -- contador de matches (0-indexed)
  v_freq      text := lower(coalesce(p_frequency, 'weekly'));
  v_offset    int := coalesce(p_biweekly_offset, 0);
begin
  if v_dow_int is null then return; end if;
  if v_offset not in (0, 1) then v_offset := 0; end if;

  for v_d in select generate_series(v_first, v_last, interval '1 day')::date loop
    if extract(dow from v_d)::int = v_dow_int then
      if v_freq = 'monthly' then
        if v_match_idx > 0 then
          v_match_idx := v_match_idx + 1;
          continue;
        end if;
      elsif v_freq = 'biweekly' then
        -- offset=0 conserva matches pares (1er/3er); offset=1 toma los impares
        -- (2do/4to) — mismo generador, dos calendarios que nunca se pisan.
        if (v_match_idx % 2) <> v_offset then
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

-- ── 2. compute_monthly_appointment_candidates: pasar biweekly_offset del slot ──
-- Reproducción verbatim de 0149 (misma firma 3 args ⇒ CREATE OR REPLACE
-- reemplaza, no crea sobrecarga). Único cambio: el 6º arg en la llamada a
-- _kn_slot_dates_in_month.

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id          uuid,
  p_period_month      date,
  p_rollover_sessions jsonb default null
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
  v_per_service     jsonb := '{}';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';
  v_therapist_map   jsonb := '{}';
  v_flat_map        jsonb := '{}';
  v_therapy         jsonb;
  v_kept_arr        jsonb;
  v_quota           int;
  v_idx             int;
  v_cand_therapist  uuid;
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
      if coalesce(v_therapy->>'therapist_id','') <> '' then
        v_therapist_map := v_therapist_map || jsonb_build_object(
          v_therapy->>'service',
          v_therapy->>'therapist_id'
        );
      end if;
      if public._kn_is_monthly_flat(v_therapy) then
        v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
      end if;
    end if;
  end loop;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    -- Servicios matutinos (mensualidad fija) NO generan citas: se atienden
    -- por sesión de grupo. Saltamos el slot por completo.
    if coalesce((v_flat_map->>v_service_key)::boolean, false) then
      continue;
    end if;
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30),
          coalesce(v_slot->>'frequency', 'weekly'),
          coalesce((v_slot->>'biweekly_offset')::int, 0)   -- nuevo
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30),
        'therapist_id', coalesce(
          v_therapist_map->>v_service_key,
          v_plan.primary_therapist_id::text
        )
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

    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    -- Cuota = plan + rollover acumulado (si aplica) para este servicio.
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0)
             + coalesce((p_rollover_sessions->>v_service_key)::int, 0);

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
    v_cand_therapist := (v_cand_obj->>'therapist_id')::uuid;
    for v_conflict in
      select a.id, a.starts_at, a.child_id
        from public.appointments a
       where a.therapist_id = v_cand_therapist
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

-- ── Fin de migración 0173_biweekly_offset ───────────────────────────────────
