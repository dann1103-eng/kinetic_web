-- =============================================================================
-- 0134 — Terapista por tipo de terapia en la generación del ciclo
-- =============================================================================
-- Hasta ahora todas las citas del ciclo se asignaban a v_plan.primary_therapist_id.
-- Ahora cada entrada de therapies_json puede llevar un `therapist_id` propio:
-- al generar el ciclo, las citas de ESE service_type se asignan a esa terapista.
-- Si la terapia no define therapist_id, se usa primary_therapist_id (fallback).
--
-- Cambios:
--   1) compute_monthly_appointment_candidates: construye un map service→therapist
--      desde therapies_json, lo adjunta a cada candidato ('therapist_id'), y
--      detecta conflictos contra la terapista REAL del candidato (no la primary).
--   2) confirm_monthly_payment_and_generate: inserta cada cita con la terapista
--      del candidato (override o auto), resolviendo por map+fallback. Re-valida
--      conflictos por esa terapista.
--
-- Se mantiene el guard plan_has_no_primary_therapist (primary sigue siendo el
-- fallback obligatorio).
-- =============================================================================

-- ── 1. compute_monthly_appointment_candidates (reemplaza 0102) ──────────────
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
  v_per_service     jsonb := '{}';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';     -- service → sessions_per_month
  v_therapist_map   jsonb := '{}';     -- service → therapist_id (solo si está seteado)
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

  if not found then
    raise exception 'no_active_treatment_plan';
  end if;

  if v_plan.primary_therapist_id is null then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  -- Maps de cuota y terapista por servicio (solo terapias activas).
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
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30),
        -- terapista del servicio (o primary como fallback)
        'therapist_id', coalesce(
          v_therapist_map->>v_service_key,
          v_plan.primary_therapist_id::text
        )
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

      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  -- Paso 3: por servicio, ordenar por starts_at y recortar a la cuota.
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

  -- Paso 4: conflictos contra la terapista REAL de cada candidato.
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

-- ── 2. confirm_monthly_payment_and_generate (reemplaza 0106) ────────────────
create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null,
  p_appointments_override jsonb default null
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
  v_conflict_count int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
  v_therapist_map jsonb := '{}';   -- service → therapist_id
  v_cand_therapist uuid;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  -- Map service → therapist desde therapies_json (solo activas con terapista).
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  -- Decidir qué appointments crear
  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    -- Re-validar conflictos sobre el override, por la terapista REAL del candidato.
    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
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

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;
    end loop;
  else
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  -- Snapshots para invoice
  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_line_total := round(
        (v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric,
        2
      );
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_invoice_id,
        v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric,
        (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total,
        0
      );
    end if;
  end loop;

  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal,
         total_a_pagar = v_subtotal
   where id = v_invoice_id;

  -- Crear appointments con la terapista resuelta por servicio.
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
      p_child_id,
      v_cand_therapist,
      'terapia',
      v_candidate->>'service',
      'presencial',
      (v_candidate->>'starts_at')::timestamptz,
      (v_candidate->>'ends_at')::timestamptz,
      'scheduled',
      auth.uid(),
      'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    p_paid_at, auth.uid(), p_payment_method, p_payment_reference, p_payment_amount,
    v_invoice_id, now(), v_appt_count,
    'generated', p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── Fin de migración 0134 ───────────────────────────────────────────────────
