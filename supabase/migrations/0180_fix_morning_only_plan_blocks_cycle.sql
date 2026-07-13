-- =============================================================================
-- 0180 — Fix: plan 100% programa matutino no podía generar ciclo ni previsualizar
-- =============================================================================
-- BUG REPORTADO: un niño inscrito SOLO en BlueKids (sin ninguna terapia
-- individual), ya asignado a maestra y grupo, no podía generar su ciclo del
-- mes ni ver la previsualización — error "El plan no tiene terapista
-- principal asignada."
--
-- CAUSA RAÍZ (confirmada contra datos reales, child Jhonatan Isaias Galvez
-- Ulloa: primary_therapist_id=null, therapies_json=[{service:'blue_kids',
-- billing_mode:'monthly_flat', therapist_id:null}]):
--
-- Desde la mig 0157 ("fin del terapista principal"), primary_therapist_id
-- se DERIVA solo de terapias individuales NO matutinas con terapista
-- asignado (planTherapistIds en monthly-flat.ts). Los programas matutinos
-- (blue_kids/learning_kids/aula_educativa) no llevan therapist_id propio —
-- los cubre el grupo (program_group_staff). Un plan 100% matutino por tanto
-- SIEMPRE tiene primary_therapist_id NULL, legítimamente.
--
-- Pero 4 funciones SQL seguían con la validación del modelo VIEJO (anterior
-- a 0157): `IF primary_therapist_id IS NULL THEN RAISE plan_has_no_primary_
-- therapist`. Nunca se actualizaron al cambiar el modelo. Esa validación ya
-- no protege nada real para planes matutinos: el bucle que genera citas
-- individuales SALTA los servicios monthly_flat (_kn_is_monthly_flat) antes
-- de necesitar primary_therapist_id para algo — es un bloqueo sin propósito
-- en ese caso.
--
-- FIX: la validación se vuelve condicional — solo bloquea si hay una
-- terapia activa que SÍ necesita terapista individual (no es monthly_flat)
-- y no lo tiene. Es la misma regla que ya aplica planHasTherapistCoverage()
-- en TS (treatment-plans.ts / monthly-flat.ts), llevada a SQL reusando el
-- helper _kn_is_monthly_flat (ya usado dentro de estas mismas funciones).
--
-- Se tocan las 4 funciones que tenían la validación vieja:
--   1) compute_monthly_appointment_candidates (dry-run/previsualización)
--   2) confirm_monthly_payment_and_generate (flujo combinado)
--   3) generate_cycle_agenda (mig 0177, flujo "solo agenda")
--   4) regenerate_cycle_appointments (mig 0177, editar ciclo)
--
-- Todas se redefinen VERBATIM salvo esa única línea de validación.
-- =============================================================================

-- ── 1. compute_monthly_appointment_candidates (verbatim de 0173, guard fix) ──
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

  -- [0180] Solo bloquea si hay una terapia activa que SÍ requiere terapista
  -- individual (no monthly_flat) y no lo tiene. Los planes 100% programa
  -- matutino no necesitan primary_therapist_id (los cubre el grupo).
  if v_plan.primary_therapist_id is null and exists (
    select 1 from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     where (t->>'active')::boolean
       and not public._kn_is_monthly_flat(t)
       and coalesce(t->>'therapist_id','') = ''
  ) then
    raise exception 'plan_has_no_primary_therapist';
  end if;

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
          coalesce((v_slot->>'biweekly_offset')::int, 0)
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

-- ── 2. confirm_monthly_payment_and_generate (verbatim de 0163, guard fix) ────
CREATE OR REPLACE FUNCTION public.confirm_monthly_payment_and_generate(
  p_child_id          uuid,
  p_period_month      date,
  p_payment_amount    numeric,
  p_payment_method    text DEFAULT 'cash',
  p_payment_reference text DEFAULT null,
  p_paid_at           timestamptz DEFAULT now(),
  p_notes             text DEFAULT null,
  p_appointments_override jsonb DEFAULT null,
  p_due_date          date DEFAULT null,
  p_rollover_sessions jsonb DEFAULT null,
  p_rollover_mode     text DEFAULT 'none',
  p_rollover_discount numeric DEFAULT 0,
  p_program_group_id  uuid DEFAULT null,
  p_attendance_days   text[] DEFAULT null
) RETURNS public.monthly_session_cycles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
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
  v_therapist_map jsonb := '{}';
  v_flat_map      jsonb := '{}';
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
BEGIN
  IF NOT public.kn_can_manage_cycles() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
    FROM public.treatment_plans
   WHERE child_id = p_child_id AND active
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_treatment_plan'; END IF;

  -- [0180] Guard condicional — ver comentario en compute_monthly_appointment_candidates.
  IF v_plan.primary_therapist_id IS NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     WHERE (t->>'active')::boolean
       AND NOT public._kn_is_monthly_flat(t)
       AND coalesce(t->>'therapist_id','') = ''
  ) THEN
    RAISE EXCEPTION 'plan_has_no_primary_therapist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.monthly_session_cycles
    WHERE child_id = p_child_id
      AND period_month = v_period
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'cycle_already_exists_for_period';
  END IF;

  v_due := coalesce(p_due_date, (v_period + 4));

  IF p_rollover_mode = 'accumulate' THEN
    v_rollover_for_compute := p_rollover_sessions;
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    END IF;
    IF (v_therapy->>'active')::boolean AND public._kn_is_monthly_flat(v_therapy) THEN
      v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
    END IF;
  END LOOP;

  IF p_appointments_override IS NOT NULL AND jsonb_typeof(p_appointments_override) = 'array' THEN
    v_appointments_to_create := p_appointments_override;

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      v_cand_therapist := coalesce(
        (v_candidate->>'therapist_id')::uuid,
        (v_therapist_map->>(v_candidate->>'service'))::uuid,
        v_plan.primary_therapist_id
      );
      SELECT count(*) INTO v_conflict_count
        FROM public.appointments a
       WHERE a.therapist_id = v_cand_therapist
         AND a.status NOT IN ('rescheduled','no_show','late_cancel')
         AND a.starts_at < (v_candidate->>'ends_at')::timestamptz
         AND a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'has_conflicts: 1';
      END IF;
    END LOOP;

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      IF (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         OR (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso THEN
        RAISE EXCEPTION 'override_date_out_of_period';
      END IF;
    END LOOP;
  ELSE
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    IF (v_summary->>'conflict_count')::int > 0 THEN
      RAISE EXCEPTION 'has_conflicts: %', (v_summary->>'conflict_count');
    END IF;
    v_appointments_to_create := v_compute->'candidates';
  END IF;

  SELECT jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    INTO v_client_snap
    FROM public.children c
   WHERE c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  INSERT INTO public.invoices (
    invoice_number, client_id, child_id, issue_date, due_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) VALUES (
    v_invoice_no, null, p_child_id, current_date, v_due,
    'USD', 0, 0, 0, 0, 0, 0,
    'issued', null, null, null,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM'))
      || '. Fecha límite de pago: ' || to_char(v_due,'DD/MM/YYYY')
      || ' (pasada esa fecha se cobra 5% de recargo por cada 5 días de atraso).',
    v_client_snap, v_emitter, auth.uid()
  )
  RETURNING id INTO v_invoice_id;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_line_total := round((v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, 'mensualidad ' || (v_therapy->>'service'), 1, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      ELSE
        v_line_total := round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, v_therapy->>'service', (v_therapy->>'sessions_per_month')::numeric, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.invoices
     SET subtotal = v_subtotal, total = v_subtotal, total_a_pagar = v_subtotal
   WHERE id = v_invoice_id;

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
  LOOP
    IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
      CONTINUE;
    END IF;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    INSERT INTO public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) VALUES (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  END LOOP;

  IF p_program_group_id IS NOT NULL THEN
    UPDATE public.program_group_members
       SET active = false, updated_at = now()
     WHERE child_id = p_child_id AND active;

    INSERT INTO public.program_group_members (group_id, child_id, attendance_days, active)
    VALUES (p_program_group_id, p_child_id, coalesce(p_attendance_days, '{}'), true)
    ON CONFLICT (child_id, group_id)
    DO UPDATE SET
      active          = true,
      attendance_days = coalesce(p_attendance_days, program_group_members.attendance_days),
      updated_at      = now();
  END IF;

  INSERT INTO public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd,
    program_group_id, attendance_days
  ) VALUES (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    v_invoice_id, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0),
    p_program_group_id, p_attendance_days
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

-- ── 3. generate_cycle_agenda (verbatim de 0177, guard fix) ───────────────────
CREATE OR REPLACE FUNCTION public.generate_cycle_agenda(
  p_child_id          uuid,
  p_period_month      date,
  p_notes             text DEFAULT null,
  p_appointments_override jsonb DEFAULT null,
  p_due_date          date DEFAULT null,
  p_rollover_sessions jsonb DEFAULT null,
  p_rollover_mode     text DEFAULT 'none',
  p_rollover_discount numeric DEFAULT 0,
  p_program_group_id  uuid DEFAULT null,
  p_attendance_days   text[] DEFAULT null
) RETURNS public.monthly_session_cycles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_conflict_count int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
  v_therapist_map jsonb := '{}';
  v_flat_map      jsonb := '{}';
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
BEGIN
  IF NOT public.kn_can_manage_cycles() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
    FROM public.treatment_plans
   WHERE child_id = p_child_id AND active
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_treatment_plan'; END IF;

  -- [0180] Guard condicional — ver comentario en compute_monthly_appointment_candidates.
  IF v_plan.primary_therapist_id IS NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     WHERE (t->>'active')::boolean
       AND NOT public._kn_is_monthly_flat(t)
       AND coalesce(t->>'therapist_id','') = ''
  ) THEN
    RAISE EXCEPTION 'plan_has_no_primary_therapist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.monthly_session_cycles
    WHERE child_id = p_child_id
      AND period_month = v_period
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'cycle_already_exists_for_period';
  END IF;

  v_due := coalesce(p_due_date, (v_period + 4));

  IF p_rollover_mode = 'accumulate' THEN
    v_rollover_for_compute := p_rollover_sessions;
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    END IF;
    IF (v_therapy->>'active')::boolean AND public._kn_is_monthly_flat(v_therapy) THEN
      v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
    END IF;
  END LOOP;

  IF p_appointments_override IS NOT NULL AND jsonb_typeof(p_appointments_override) = 'array' THEN
    v_appointments_to_create := p_appointments_override;

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      v_cand_therapist := coalesce(
        (v_candidate->>'therapist_id')::uuid,
        (v_therapist_map->>(v_candidate->>'service'))::uuid,
        v_plan.primary_therapist_id
      );
      SELECT count(*) INTO v_conflict_count
        FROM public.appointments a
       WHERE a.therapist_id = v_cand_therapist
         AND a.status NOT IN ('rescheduled','no_show','late_cancel')
         AND a.starts_at < (v_candidate->>'ends_at')::timestamptz
         AND a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'has_conflicts: 1';
      END IF;
    END LOOP;

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      IF (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         OR (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso THEN
        RAISE EXCEPTION 'override_date_out_of_period';
      END IF;
    END LOOP;
  ELSE
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    IF (v_summary->>'conflict_count')::int > 0 THEN
      RAISE EXCEPTION 'has_conflicts: %', (v_summary->>'conflict_count');
    END IF;
    v_appointments_to_create := v_compute->'candidates';
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_subtotal := v_subtotal + round((v_therapy->>'unit_cost_usd')::numeric, 2);
      ELSE
        v_subtotal := v_subtotal + round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
      END IF;
    END IF;
  END LOOP;

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
  LOOP
    IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
      CONTINUE;
    END IF;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    INSERT INTO public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) VALUES (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  END LOOP;

  IF p_program_group_id IS NOT NULL THEN
    UPDATE public.program_group_members
       SET active = false, updated_at = now()
     WHERE child_id = p_child_id AND active;

    INSERT INTO public.program_group_members (group_id, child_id, attendance_days, active)
    VALUES (p_program_group_id, p_child_id, coalesce(p_attendance_days, '{}'), true)
    ON CONFLICT (child_id, group_id)
    DO UPDATE SET
      active          = true,
      attendance_days = coalesce(p_attendance_days, program_group_members.attendance_days),
      updated_at      = now();
  END IF;

  INSERT INTO public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd,
    program_group_id, attendance_days
  ) VALUES (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    null, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0),
    p_program_group_id, p_attendance_days
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

-- ── 4. regenerate_cycle_appointments (verbatim de 0177, guard fix) ───────────
create or replace function public.regenerate_cycle_appointments(
  p_cycle_id              uuid,
  p_appointments_override jsonb default null,
  p_only_future           boolean default false
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
  if v_cycle.status <> 'generated' then
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

  -- [0180] Guard condicional — ver comentario en compute_monthly_appointment_candidates.
  if v_plan.primary_therapist_id is null and exists (
    select 1 from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     where (t->>'active')::boolean
       and not public._kn_is_monthly_flat(t)
       and coalesce(t->>'therapist_id','') = ''
  ) then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo regenerado'
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and notes like '%Auto-generado del ciclo%'
     and (not p_only_future or starts_at >= now());

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
      if p_only_future and (v_candidate->>'starts_at')::timestamptz < now() then
        continue;
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
    v_compute := public.compute_monthly_appointment_candidates(v_cycle.child_id, v_period, null);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    if p_only_future and (v_candidate->>'starts_at')::timestamptz < now() then
      continue;
    end if;
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

notify pgrst, 'reload schema';

-- ── Fin de migración 0180 ────────────────────────────────────────────────────
